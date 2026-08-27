import { getDb } from './db.js'
import { HORARIO_PADRAO_CHECKIN, HORARIO_PADRAO_CHECKLIST } from '../constants.js'
import { registrarAcaoAdmin, ACOES } from './auditoriaAdminRepo.js'

/**
 * Configuração viva: os números e horários que o piloto existe para calibrar,
 * editáveis pela interface em vez de por deploy.
 *
 * ORDEM DE LEITURA, três degraus:
 *   1. `config_global`, se a chave existir;
 *   2. a variável de ambiente, para as chaves que têm uma;
 *   3. a constante do código, sempre.
 *
 * São três, e não dois, porque parte das chaves NUNCA teve variável de ambiente —
 * os horários padrão de gatilho sempre foram constantes exportadas. Um fallback de
 * dois degraus deixaria essas chaves sem valor num banco recém-criado.
 *
 * O que NÃO entra aqui, nunca: chave de API de provedor, e o provedor ativo. O
 * segundo é da tela de credenciais (arquivo no volume) — duas fontes de verdade
 * para o mesmo botão fariam quem mudasse na tela errada não ver efeito nenhum.
 */

/**
 * As chaves conhecidas, com tipo, faixa, variável de ambiente (quando houver) e
 * a constante de fábrica.
 *
 * Lista FECHADA: chave desconhecida é recusada na escrita. Sem isso, um typo na
 * interface criaria uma linha que nada lê, e o operador acharia que configurou.
 */
export const CHAVES = Object.freeze({
  RESPOSTA_GATILHO_JANELA_MIN: {
    tipo: 'numero',
    env: 'RESPOSTA_GATILHO_JANELA_MIN',
    padrao: 120,
    min: 5,
    max: 1440,
    rotulo: 'Janela de resposta a gatilho (min)',
  },
  SILENCIOS_ATE_REDUZIR_TOM: {
    tipo: 'numero',
    env: 'SILENCIOS_ATE_REDUZIR_TOM',
    padrao: 3,
    min: 1,
    max: 20,
    rotulo: 'Silêncios até reduzir o tom',
  },
  HORARIO_PADRAO_CHECKIN: {
    tipo: 'horario',
    env: null, // nunca teve; é constante do código desde sempre
    padrao: HORARIO_PADRAO_CHECKIN,
    rotulo: 'Horário padrão do check-in',
  },
  HORARIO_PADRAO_CHECKLIST: {
    tipo: 'horario',
    env: null,
    padrao: HORARIO_PADRAO_CHECKLIST,
    rotulo: 'Horário padrão do checklist',
  },
  DEBOUNCE_SEGUNDOS: {
    tipo: 'numero',
    env: 'DEBOUNCE_SEGUNDOS',
    padrao: 0, // nasce DESLIGADO: zero é o comportamento de hoje
    min: 0,
    max: 120,
    rotulo: 'Agrupar mensagens por (s)',
  },
  TESTE_IA_LIMITE_HORA: {
    tipo: 'numero',
    env: null,
    padrao: 20, // zero desliga o limite
    min: 0,
    max: 1000,
    rotulo: 'Testes de persona por hora',
  },
})

const HORARIO = /^([01]\d|2[0-3]):[0-5]\d$/

/**
 * Valida contra o tipo declarado. Devolve o valor JÁ NORMALIZADO, ou lança.
 *
 * Lançar, e não devolver `null`: gravar valor inválido em silêncio é o defeito
 * que esta função existe para impedir, e um retorno falsy seria fácil de ignorar.
 */
export function validar(chave, valorBruto) {
  const def = CHAVES[chave]
  if (!def) throw new Error(`Chave de configuração desconhecida: ${chave}`)

  const bruto = String(valorBruto ?? '').trim()
  if (!bruto) throw new Error(`Valor vazio para ${chave}`)

  if (def.tipo === 'numero') {
    const n = Number(bruto)
    if (!Number.isInteger(n)) throw new Error(`${chave} precisa ser um número inteiro`)
    if (n < def.min || n > def.max) {
      throw new Error(`${chave} precisa estar entre ${def.min} e ${def.max}`)
    }
    return String(n)
  }

  if (def.tipo === 'horario') {
    if (!HORARIO.test(bruto)) throw new Error(`${chave} precisa estar no formato HH:MM`)
    return bruto
  }

  return bruto
}

/** Converte o texto guardado para o tipo que o app espera. */
const tipar = (def, texto) => (def.tipo === 'numero' ? Number(texto) : texto)

// Cache por processo, validado pelo momento da última escrita.
//
// O bot e o admin são containers separados: invalidar só na escrita valeria para
// quem escreveu, e o outro seguiria com o valor velho sem ninguém perceber. Uma
// consulta barata de agregação por leitura resolve — é o mesmo princípio do
// `mtime` usado no arquivo de credenciais.
let cache = null
let marcaLida = null

function carregar(db) {
  const marca =
    db.prepare('SELECT MAX(atualizado_em) m, COUNT(*) n FROM config_global').get() ?? {}
  const assinatura = `${marca.m ?? ''}:${marca.n ?? 0}`

  if (cache !== null && assinatura === marcaLida) return cache

  cache = Object.fromEntries(
    db.prepare('SELECT chave, valor FROM config_global').all().map((l) => [l.chave, l.valor]),
  )
  marcaLida = assinatura
  return cache
}

/** O valor vigente de uma chave, pelos três degraus. */
export function ler(chave, db = getDb()) {
  const def = CHAVES[chave]
  if (!def) throw new Error(`Chave de configuração desconhecida: ${chave}`)

  const doBanco = carregar(db)[chave]
  if (doBanco !== undefined) return tipar(def, doBanco)

  const doAmbiente = def.env ? process.env[def.env] : undefined
  if (doAmbiente !== undefined && String(doAmbiente).trim() !== '') {
    try {
      return tipar(def, validar(chave, doAmbiente))
    } catch {
      // Ambiente com valor inválido não derruba o app nem vira exceção no meio de
      // uma conversa: cai para a constante, que sempre existe.
      console.warn(`[config] ${def.env} tem valor inválido; usando o padrão do código`)
    }
  }

  return def.padrao
}

/** De onde veio o valor vigente — para a interface mostrar sem adivinhar. */
export function origem(chave, db = getDb()) {
  const def = CHAVES[chave]
  if (carregar(db)[chave] !== undefined) return 'banco'
  if (def?.env && String(process.env[def.env] ?? '').trim() !== '') return 'ambiente'
  return 'codigo'
}

export function listarTudo(db = getDb()) {
  return Object.entries(CHAVES).map(([chave, def]) => ({
    chave,
    rotulo: def.rotulo,
    tipo: def.tipo,
    valor: ler(chave, db),
    origem: origem(chave, db),
    padrao: def.padrao,
    min: def.min,
    max: def.max,
  }))
}

/**
 * Grava um valor novo, registrando o ANTERIOR no histórico.
 *
 * O histórico guarda o valor que estava valendo — inclusive quando ele vinha do
 * ambiente ou da constante, e não do banco. Sem isso, a primeira edição de uma
 * chave perderia de onde ela partiu, que é justamente a pergunta de quem quer
 * reverter.
 */
export function escrever(chave, valorBruto, adminId = null, db = getDb()) {
  const def = CHAVES[chave]
  if (!def) throw new Error(`Chave de configuração desconhecida: ${chave}`)

  const valor = validar(chave, valorBruto)
  const anterior = String(ler(chave, db))

  db.transaction(() => {
    db.prepare(
      `INSERT INTO config_historico (chave, valor_antigo, alterado_em, alterado_por)
            VALUES (?, ?, ?, ?)`,
    ).run(chave, anterior, new Date().toISOString(), adminId)

    db.prepare(
      `INSERT INTO config_global (chave, valor, tipo, atualizado_em, atualizado_por)
            VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(chave) DO UPDATE SET
            valor = excluded.valor,
            atualizado_em = excluded.atualizado_em,
            atualizado_por = excluded.atualizado_por`,
    ).run(chave, valor, def.tipo, new Date().toISOString(), adminId)
  })()

  invalidar()

  // A auditoria vive AQUI, e não na rota: assim nenhuma escrita de configuração
  // consegue existir sem rastro, venha de onde vier.
  //
  // Vai para `auditoria_admin` porque é ação sobre o SISTEMA — não tem
  // participante associado, e `historico_interacoes.usuario_id` é obrigatório.
  registrarAcaoAdmin(
    {
      autorId: adminId,
      acao: ACOES.CONFIGUROU_SISTEMA,
      descricao: `configuração ${chave}: "${anterior}" → "${valor}"`,
    },
    db,
  )

  return { chave, anterior, atual: tipar(def, valor) }
}

/** O histórico de uma chave, do mais recente para o mais antigo. */
export function historico(chave, limite = 20, db = getDb()) {
  return db
    .prepare(
      `SELECT h.*, a.email AS autor_email
         FROM config_historico h
    LEFT JOIN admin_usuarios a ON a.admin_id = h.alterado_por
        WHERE h.chave = ?
     ORDER BY h.alterado_em DESC, h.historico_id DESC
        LIMIT ?`,
    )
    .all(chave, limite)
}

/**
 * Reverter é ESCREVER de novo, não desfazer.
 *
 * A linha antiga do histórico continua onde está, e a reversão acrescenta a sua.
 * Um "desfazer" que apagasse o rastro tiraria do piloto a única resposta para
 * "o comportamento mudou; foi o produto ou fui eu mexendo?".
 */
export function reverter(historicoId, adminId = null, db = getDb()) {
  const linha = db
    .prepare('SELECT * FROM config_historico WHERE historico_id = ?')
    .get(historicoId)
  if (!linha) throw new Error('Ponto de histórico não encontrado')

  return escrever(linha.chave, linha.valor_antigo, adminId, db)
}

/** Volta à constante do código, e isso também é uma escrita com histórico. */
export function restaurarPadrao(chave, adminId = null, db = getDb()) {
  const def = CHAVES[chave]
  if (!def) throw new Error(`Chave de configuração desconhecida: ${chave}`)
  return escrever(chave, String(def.padrao), adminId, db)
}

/** Só para teste: descarta o cache sem tocar no banco. */
export function invalidar() {
  cache = null
  marcaLida = null
}
