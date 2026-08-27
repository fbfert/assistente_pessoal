import { getDb } from './db.js'
import { NUCLEO_FIXO, VARIANTES } from '../llm/prompts.js'
import {
  MARCADOR_REMEDIO,
  TEXTO_REMEDIO,
  TEXTO_CHECKIN_MANHA,
  TEXTO_CHECKIN_MANHA_REDUZIDO,
  TEXTO_CHECKLIST_FIM_DIA,
  TEXTO_CHECKLIST_FIM_DIA_REDUZIDO,
} from '../triggers/messages.js'
import { ESTADOS, PERGUNTAS, TEXTO_CONSENTIMENTO } from '../anamnese/questions.js'

/**
 * Conteúdo versionado: o texto do produto, editável sem deploy.
 *
 * A CONSTANTE DO CÓDIGO É O PADRÃO DE FÁBRICA. Uma chave ausente do banco é
 * semeada na primeira leitura com o valor do código e devolvida — então o dia
 * zero desta mudança é idêntico ao dia anterior, e "restaurar padrão" volta à
 * constante, não à linha mais antiga do histórico, que já pode ser uma edição.
 *
 * O núcleo fixo carrega as regras de segurança do produto, incluindo a 1b (nunca
 * inventar dado de saúde) e a 1c (nunca instruir sobre medicação). Editá-lo exige
 * CONFIRMAÇÃO REFORÇADA, e a exigência vive aqui — não na tela. Uma guarda só de
 * interface é contornável por qualquer caminho novo que alguém escreva depois.
 *
 * A segunda camada contra instrução de medicação (`src/conversa/seguranca.js`)
 * NÃO é conteúdo versionado, de propósito: se fosse, uma única edição descuidada
 * removeria as duas proteções de uma vez.
 */

const chaveDaPergunta = (estado) =>
  `pergunta_${Object.keys(ESTADOS).find((n) => ESTADOS[n] === Number(estado)).toLowerCase()}`

/** Padrões de fábrica, derivados do código — nunca redigitados. */
function montarSeeds() {
  const seeds = {
    nucleo_fixo: {
      conteudo: NUCLEO_FIXO,
      rotulo: 'Núcleo fixo de regras',
      reforcada: true,
    },
    mensagem_remedio: {
      conteudo: TEXTO_REMEDIO,
      rotulo: 'Mensagem do gatilho de remédio',
      exige: MARCADOR_REMEDIO,
    },
    // Forma normal e forma REDUZIDA são chaves separadas: a reduzida é a regra de
    // silêncio em ação, e versionar só uma delas deixaria metade do comportamento
    // fora do alcance de quem calibra.
    mensagem_checkin_manha: {
      conteudo: TEXTO_CHECKIN_MANHA,
      rotulo: 'Check-in da manhã',
    },
    mensagem_checkin_manha_reduzido: {
      conteudo: TEXTO_CHECKIN_MANHA_REDUZIDO,
      rotulo: 'Check-in da manhã (tom reduzido)',
    },
    mensagem_checklist_fim_dia: {
      conteudo: TEXTO_CHECKLIST_FIM_DIA,
      rotulo: 'Checklist do fim do dia',
    },
    mensagem_checklist_fim_dia_reduzido: {
      conteudo: TEXTO_CHECKLIST_FIM_DIA_REDUZIDO,
      rotulo: 'Checklist do fim do dia (tom reduzido)',
    },
    texto_consentimento: {
      conteudo: TEXTO_CONSENTIMENTO,
      rotulo: 'Texto de consentimento',
    },
  }

  for (const [nome, texto] of Object.entries(VARIANTES)) {
    seeds[`variante_${nome}`] = { conteudo: texto, rotulo: `Variante de tom: ${nome}` }
  }

  for (const [estado, pergunta] of Object.entries(PERGUNTAS)) {
    seeds[chaveDaPergunta(estado)] = {
      conteudo: pergunta.texto,
      rotulo: `Pergunta: ${pergunta.campo ?? 'remédio'}`,
    }
  }

  return Object.freeze(seeds)
}

/**
 * O catálogo é montado na PRIMEIRA USO, não na avaliação do módulo.
 *
 * Não é preferência de estilo: este arquivo e `prompts.js` se importam
 * mutuamente — um precisa da constante de fábrica, o outro do valor vigente.
 * Montar os seeds no topo tocaria em `NUCLEO_FIXO` antes de `prompts.js`
 * terminar de avaliar, e o processo subia com "Cannot access 'NUCLEO_FIXO'
 * before initialization". Adiar para dentro de função é o que fecha o ciclo em
 * segurança, como já é feito em `config.js` e `chavesRepo.js`.
 */
let catalogoMontado = null

export function catalogo() {
  return (catalogoMontado ??= montarSeeds())
}

/** A palavra que a segunda etapa exige para o núcleo fixo. */
export const PALAVRA_DE_CONFIRMACAO = 'nucleo_fixo'

// Cache validado pelo momento da última escrita — o bot e o admin são processos
// separados, e invalidar só na escrita deixaria o bot mandando o texto que o
// operador acabou de corrigir.
let cache = null
let marcaLida = null

function carregar(db) {
  const m = db.prepare('SELECT MAX(atualizado_em) m, COUNT(*) n FROM prompts_versionados').get()
  const assinatura = `${m?.m ?? ''}:${m?.n ?? 0}`
  if (cache !== null && assinatura === marcaLida) return cache

  cache = Object.fromEntries(
    db
      .prepare('SELECT chave, conteudo FROM prompts_versionados')
      .all()
      .map((l) => [l.chave, l.conteudo]),
  )
  marcaLida = assinatura
  return cache
}

/**
 * O texto vigente. Semeia a chave ausente e devolve o padrão.
 *
 * A semeadura é defensiva: se o banco recusar a escrita — só leitura, travado,
 * o que for —, a leitura ainda devolve a constante. Conteúdo do produto nunca
 * pode faltar por causa de um problema de gravação.
 */
export function ler(chave, db = getDb()) {
  const seed = catalogo()[chave]
  if (!seed) throw new Error(`Chave de conteúdo desconhecida: ${chave}`)

  const guardado = carregar(db)[chave]
  if (guardado !== undefined) return guardado

  try {
    db.prepare(
      'INSERT OR IGNORE INTO prompts_versionados (chave, conteudo, atualizado_em) VALUES (?, ?, ?)',
    ).run(chave, seed.conteudo, new Date().toISOString())
    invalidar()
  } catch (e) {
    console.warn(`[conteudo] não consegui semear ${chave}: ${e?.message ?? e}`)
  }

  return seed.conteudo
}

export function listarTudo(db = getDb()) {
  return Object.entries(catalogo()).map(([chave, seed]) => ({
    chave,
    rotulo: seed.rotulo,
    conteudo: ler(chave, db),
    padrao: seed.conteudo,
    reforcada: Boolean(seed.reforcada),
    editado: ler(chave, db) !== seed.conteudo,
  }))
}

/**
 * Valida o texto novo. Devolve o conteúdo normalizado, ou lança.
 *
 * Núcleo fixo vazio é recusado antes de qualquer outra coisa: um system prompt
 * sem as regras de segurança é pior que qualquer texto ruim que alguém escreva.
 */
export function validar(chave, conteudoBruto) {
  const seed = catalogo()[chave]
  if (!seed) throw new Error(`Chave de conteúdo desconhecida: ${chave}`)

  const texto = String(conteudoBruto ?? '').trim()
  if (!texto) throw new Error(`${chave} não pode ficar vazio`)

  if (seed.exige && !texto.includes(seed.exige)) {
    throw new Error(`${chave} precisa conter ${seed.exige}`)
  }

  return texto
}

/**
 * Grava, exigindo confirmação reforçada onde o padrão pede.
 *
 * @param {{adminId?: number|null, confirmacao?: string}} opcoes
 */
export function escrever(chave, conteudoBruto, { adminId = null, confirmacao = null } = {}, db = getDb()) {
  const seed = catalogo()[chave]
  if (!seed) throw new Error(`Chave de conteúdo desconhecida: ${chave}`)

  if (seed.reforcada && String(confirmacao ?? '').trim() !== PALAVRA_DE_CONFIRMACAO) {
    throw new Error(
      `${chave} exige confirmação reforçada: digite "${PALAVRA_DE_CONFIRMACAO}" para confirmar`,
    )
  }

  const conteudo = validar(chave, conteudoBruto)
  const anterior = ler(chave, db)

  db.transaction(() => {
    db.prepare(
      `INSERT INTO prompts_historico (chave, conteudo_antigo, alterado_em, alterado_por)
            VALUES (?, ?, ?, ?)`,
    ).run(chave, anterior, new Date().toISOString(), adminId)

    db.prepare(
      `INSERT INTO prompts_versionados (chave, conteudo, atualizado_em, atualizado_por)
            VALUES (?, ?, ?, ?)
       ON CONFLICT(chave) DO UPDATE SET
            conteudo = excluded.conteudo,
            atualizado_em = excluded.atualizado_em,
            atualizado_por = excluded.atualizado_por`,
    ).run(chave, conteudo, new Date().toISOString(), adminId)
  })()

  invalidar()
  return { chave, anterior, atual: conteudo }
}

export function historico(chave, limite = 20, db = getDb()) {
  return db
    .prepare(
      `SELECT h.*, a.email AS autor_email
         FROM prompts_historico h
    LEFT JOIN admin_usuarios a ON a.admin_id = h.alterado_por
        WHERE h.chave = ?
     ORDER BY h.alterado_em DESC, h.historico_id DESC
        LIMIT ?`,
    )
    .all(chave, limite)
}

/** Reverter é escrever de novo: a linha antiga fica, e esta se soma. */
export function reverter(historicoId, opcoes = {}, db = getDb()) {
  const linha = db.prepare('SELECT * FROM prompts_historico WHERE historico_id = ?').get(historicoId)
  if (!linha) throw new Error('Ponto de histórico não encontrado')

  return escrever(linha.chave, linha.conteudo_antigo, opcoes, db)
}

/** Volta à constante do código — o padrão de fábrica, não o histórico. */
export function restaurarPadrao(chave, opcoes = {}, db = getDb()) {
  const seed = catalogo()[chave]
  if (!seed) throw new Error(`Chave de conteúdo desconhecida: ${chave}`)
  return escrever(chave, seed.conteudo, opcoes, db)
}

/** Atalhos que o runtime usa — nomeados para o chamador não montar chave à mão. */
export const nucleoFixoVigente = (db) => ler('nucleo_fixo', db)
export const varianteVigente = (nome, db) => ler(`variante_${nome}`, db)
export const perguntaVigente = (estado, db) => ler(chaveDaPergunta(estado), db)
export const consentimentoVigente = (db) => ler('texto_consentimento', db)

/**
 * Versão vigente do consentimento, DERIVADA do histórico daquela chave.
 *
 * `v1` é o texto de fábrica; cada edição gravada leva à seguinte. Derivar em vez
 * de guardar num campo à parte elimina o estado que poderia divergir: não existe
 * caminho de salvar o texto mantendo a versão, porque a versão é uma contagem do
 * que já foi salvo.
 *
 * Isso importa porque `usuarios.consentimento_versao` só significa alguma coisa
 * se identificar QUAL texto a pessoa leu. Uma edição sem troca de versão faria o
 * campo apontar para um conteúdo que não existe mais.
 *
 * Restaurar o padrão também incrementa — é uma gravação como qualquer outra, e o
 * texto de `v3` ser igual ao de `v1` não muda o fato de que houve duas mudanças
 * no meio.
 */
export function versaoDoConsentimento(db = getDb()) {
  const { n } = db
    .prepare("SELECT COUNT(*) n FROM prompts_historico WHERE chave = 'texto_consentimento'")
    .get()
  return `v${n + 1}`
}

/** Os dois textos de um gatilho, na forma que `montarMensagemGatilho` consome. */
export const textosDoGatilho = (tipo, db) => ({
  normal: ler(`mensagem_${tipo}`, db),
  reduzido: catalogo()[`mensagem_${tipo}_reduzido`]
    ? ler(`mensagem_${tipo}_reduzido`, db)
    : undefined,
})

export function invalidar() {
  cache = null
  marcaLida = null
}

/**
 * Atualiza o texto de fábrica das chaves que o operador NUNCA editou.
 *
 * O problema que isto resolve: a semente só entra na primeira leitura. Um banco
 * que já semeou `nucleo_fixo` guarda o texto de então — e uma regra nova escrita
 * na constante deste código jamais chegaria à conversa. Foi o caso da regra 3b,
 * sobre a técnica opcional: sem isto, ela existiria no repositório e não no
 * produto.
 *
 * O critério de "nunca editou" é a AUSÊNCIA de histórico para a chave. Toda
 * escrita de operador passa por `escrever`, que grava histórico — então chave sem
 * histórico é chave que só tem o valor de fábrica, e refrescá-la não apaga
 * trabalho de ninguém. Chave com histórico é deixada em paz, sempre: quem
 * reescreveu o núcleo fixo à mão não pode perdê-lo num deploy.
 *
 * @returns {string[]} as chaves atualizadas agora
 */
export function atualizarSeedsNaoEditados(db = getDb()) {
  const atualizadas = []

  const guardado = db.prepare('SELECT chave, conteudo FROM prompts_versionados').all()
  const temHistorico = db.prepare('SELECT 1 FROM prompts_historico WHERE chave = ? LIMIT 1')
  const gravar = db.prepare(
    'UPDATE prompts_versionados SET conteudo = ?, atualizado_em = ? WHERE chave = ?',
  )

  for (const linha of guardado) {
    const seed = catalogo()[linha.chave]
    if (!seed || seed.conteudo === linha.conteudo) continue
    if (temHistorico.get(linha.chave)) continue

    gravar.run(seed.conteudo, new Date().toISOString(), linha.chave)
    atualizadas.push(linha.chave)
  }

  if (atualizadas.length) {
    invalidar()
    console.log(`[conteudo] padrão de fábrica atualizado: ${atualizadas.join(', ')}`)
  }

  return atualizadas
}
