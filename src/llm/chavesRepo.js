import { readFileSync, writeFileSync, statSync, renameSync, mkdirSync, unlinkSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { config } from '../config.js'

/**
 * Credenciais de provedor de LLM: chave de API e modelo.
 *
 * Vive em ARQUIVO no volume compartilhado — não em `.env`, não no SQLite.
 *
 * Não `.env`: o Compose lê `env_file` uma única vez, quando o container sobe, e
 * injeta as variáveis no processo. Escrever num `.env` de dentro do container não
 * alcança o outro container e some no próximo rebuild.
 *
 * Não SQLite: o banco é o que se copia em backup, o que se inspeciona quando algo
 * dá errado, e o que tem "ver histórico" como funcionalidade. Quanto menos código
 * consegue ler uma credencial, menor a chance de um bug expô-la.
 *
 * REGRA DESTE MÓDULO: a chave completa só sai por `ler()`, chamada exclusivamente
 * pelo router. Tudo o que a interface consome passa por `status()`, que devolve
 * apenas o mascarado. Não existe caminho de leitura da chave para um template.
 */

export const PROVIDERS = Object.freeze(['claude', 'openai', 'deepseek'])

/** Quantos caracteres finais a interface mostra para identificar a chave. */
const CARACTERES_VISIVEIS = 4

const caminho = () => config.llm.chavesPath

// Cache por processo, validado pelo horário de modificação do arquivo.
let cache = null
let mtimeLido = null

/**
 * Relê o arquivo apenas quando ele mudou.
 *
 * Mesmo princípio do `MAX(atualizado_em)` usado para configuração no banco,
 * adaptado para arquivo: uma chamada barata de metadados por uso, em vez de
 * reler o conteúdo. Sem isso, trocar a chave pelo admin não alcançaria o bot
 * até o próximo reinício — e ninguém perceberia, porque o admin mostraria a
 * chave nova como configurada enquanto o bot seguiria usando a antiga.
 */
function carregar() {
  let mtime
  try {
    mtime = statSync(caminho()).mtimeMs
  } catch {
    // Arquivo ainda não existe: nenhum provedor configurado. O fallback para o
    // ambiente é quem responde.
    cache = {}
    mtimeLido = null
    return cache
  }

  if (cache !== null && mtime === mtimeLido) return cache

  try {
    const bruto = readFileSync(caminho(), 'utf8')
    const dados = JSON.parse(bruto)
    cache = dados && typeof dados === 'object' ? dados : {}
  } catch (e) {
    // JSON corrompido não derruba o processo: trata como nada configurado e
    // deixa o ambiente agir. A mensagem NÃO inclui o conteúdo do arquivo.
    console.error(`[credenciais] arquivo ilegível (${e?.name ?? 'erro'}); usando o ambiente`)
    cache = {}
  }

  mtimeLido = mtime
  return cache
}

/**
 * Chave e modelo de um provedor, ou null se não configurado.
 *
 * ÚNICA função que devolve a chave completa. Só o router deve chamá-la.
 */
export function ler(provider) {
  const entrada = carregar()[provider]
  if (!entrada?.apiKey) return null

  return { apiKey: entrada.apiKey, model: entrada.model || null }
}

/**
 * O que a interface pode ver. Nunca a chave inteira.
 */
export function status(provider) {
  const entrada = carregar()[provider]
  const apiKey = entrada?.apiKey

  return {
    configurado: Boolean(apiKey),
    ultimosCaracteres: apiKey ? apiKey.slice(-CARACTERES_VISIVEIS) : null,
    model: entrada?.model || null,
  }
}

export function statusDeTodos() {
  return Object.fromEntries(PROVIDERS.map((p) => [p, status(p)]))
}

/**
 * Grava chave e/ou modelo de um provedor.
 *
 * `apiKey` ausente ou vazio PRESERVA a chave atual — é o que permite editar só o
 * modelo sem precisar redigitar a credencial, e o que faz o campo write-only da
 * tela funcionar (ele chega vazio quando não se quer trocar).
 *
 * A escrita é atômica: grava num temporário no mesmo diretório e renomeia por
 * cima. O admin escreve enquanto o bot pode estar lendo; escrever direto deixaria
 * uma janela em que o leitor obtém JSON truncado.
 */
export function escrever(provider, { apiKey, model } = {}) {
  if (!PROVIDERS.includes(provider)) {
    throw new Error(`Provedor desconhecido: ${provider}`)
  }

  const dados = { ...carregar() }
  const atual = dados[provider] ?? {}

  const novaChave = typeof apiKey === 'string' ? apiKey.trim() : ''
  const novoModelo = typeof model === 'string' ? model.trim() : ''

  dados[provider] = {
    apiKey: novaChave || atual.apiKey || '',
    model: novoModelo || atual.model || '',
  }

  const destino = caminho()
  mkdirSync(dirname(destino), { recursive: true })

  const temporario = join(dirname(destino), `.llm-chaves.${process.pid}.tmp`)
  try {
    writeFileSync(temporario, JSON.stringify(dados, null, 2), { mode: 0o600 })
    renameSync(temporario, destino)
  } catch (e) {
    try {
      unlinkSync(temporario)
    } catch {
      /* o temporário pode nem ter sido criado */
    }
    throw e
  }

  // Força a releitura na próxima consulta deste processo.
  cache = null
  mtimeLido = null

  return status(provider)
}

/** Só para teste: descarta o cache sem tocar no arquivo. */
export function _limparCache() {
  cache = null
  mtimeLido = null
}
