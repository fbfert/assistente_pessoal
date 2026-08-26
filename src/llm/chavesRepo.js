import { readFileSync, writeFileSync, statSync, renameSync, mkdirSync, unlinkSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { config } from '../config.js'

/**
 * Credenciais de provedor de LLM: chave de API, modelo, provedor ativo e o
 * modelo de transcrição.
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
 *
 * Formato do arquivo:
 *   {
 *     "ativo": "claude",
 *     "claude":   { "apiKey": "...", "model": "..." },
 *     "openai":   { "apiKey": "...", "model": "...", "transcriptionModel": "..." },
 *     "deepseek": { "apiKey": "...", "model": "..." }
 *   }
 *
 * `ativo` fica FORA do mapa de provedores, no topo: é escolha de qual usar, não
 * credencial de ninguém. `transcriptionModel` existe só em `openai`, porque a
 * transcrição é sempre OpenAI e usa a chave que já está ali — não é uma
 * credencial separada e não deve parecer uma.
 */

export const PROVIDERS = Object.freeze(['claude', 'openai', 'deepseek'])

/** Chave de topo do arquivo. Não é provedor — por isso não entra em PROVIDERS. */
const CHAVE_ATIVO = 'ativo'

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

const texto = (v) => (typeof v === 'string' && v.trim() ? v.trim() : null)

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
 *
 * `transcriptionModel` só faz sentido em `openai` — nos outros vem null, para
 * que a tela não tenha como oferecer o campo onde ele não existe.
 */
export function status(provider) {
  const entrada = carregar()[provider]
  const apiKey = entrada?.apiKey

  return {
    configurado: Boolean(apiKey),
    ultimosCaracteres: apiKey ? apiKey.slice(-CARACTERES_VISIVEIS) : null,
    model: entrada?.model || null,
    transcriptionModel: provider === 'openai' ? texto(entrada?.transcriptionModel) : null,
  }
}

export function statusDeTodos() {
  return Object.fromEntries(PROVIDERS.map((p) => [p, status(p)]))
}

/**
 * Grava chave, modelo e — só para `openai` — o modelo de transcrição.
 *
 * Campo ausente ou vazio PRESERVA o valor atual — é o que permite editar só o
 * modelo sem redigitar a credencial, e o que faz o campo write-only da tela
 * funcionar (ele chega vazio quando não se quer trocar).
 *
 * A escrita é atômica: grava num temporário no mesmo diretório e renomeia por
 * cima. O admin escreve enquanto o bot pode estar lendo; escrever direto deixaria
 * uma janela em que o leitor obtém JSON truncado.
 */
export function escrever(provider, { apiKey, model, transcriptionModel } = {}) {
  if (!PROVIDERS.includes(provider)) {
    throw new Error(`Provedor desconhecido: ${provider}`)
  }

  const dados = { ...carregar() }
  const atual = dados[provider] ?? {}

  const entrada = {
    apiKey: texto(apiKey) || atual.apiKey || '',
    model: texto(model) || atual.model || '',
  }

  // Só a OpenAI transcreve. Gravar o campo nos outros criaria um valor que nada
  // lê e que a tela teria de fingir que não existe.
  if (provider === 'openai') {
    const t = texto(transcriptionModel) || texto(atual.transcriptionModel)
    if (t) entrada.transcriptionModel = t
  }

  dados[provider] = entrada
  gravarArquivo(dados)

  return status(provider)
}

/**
 * Provedor ativo na conversa, ou null quando o arquivo não define nenhum.
 *
 * Valor desconhecido é tratado como ausente, em vez de propagado: um arquivo
 * editado à mão com "gemini" faria toda chamada morrer em "provedor
 * desconhecido", sem que a tela mostrasse nada de errado.
 */
export function lerAtivo() {
  const v = carregar()[CHAVE_ATIVO]
  return PROVIDERS.includes(v) ? v : null
}

export function escreverAtivo(provider) {
  if (!PROVIDERS.includes(provider)) {
    throw new Error(`Provedor desconhecido: ${provider}`)
  }

  gravarArquivo({ ...carregar(), [CHAVE_ATIVO]: provider })
  return provider
}

/**
 * Modelo de transcrição vigente: arquivo primeiro, padrão depois.
 *
 * O padrão chega por parâmetro — quem o conhece é `config.transcription`, e
 * receber em vez de importar é o que mantém este módulo sem opinião sobre
 * ambiente.
 */
export function modeloTranscricao(padrao) {
  return texto(carregar().openai?.transcriptionModel) || padrao
}

/**
 * Lista curada de modelos para a tela, DERIVADA do que o projeto já usa —
 * nunca uma lista redigitada, que envelhece a cada modelo novo.
 *
 * São no máximo dois itens: o padrão vigente em `config` (que já reflete o
 * `.env`) e o que estiver gravado, quando diferente. O campo de texto livre ao
 * lado é a fuga para qualquer outro.
 */
export function modelosConhecidos(provider) {
  return unicos([config.llm[provider]?.model, status(provider).model])
}

export function modelosTranscricaoConhecidos() {
  return unicos([config.transcription.modelPadrao, status('openai').transcriptionModel])
}

const unicos = (valores) => [...new Set(valores.map(texto).filter(Boolean))]

function gravarArquivo(dados) {
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
}

/** Só para teste: descarta o cache sem tocar no arquivo. */
export function _limparCache() {
  cache = null
  mtimeLido = null
}
