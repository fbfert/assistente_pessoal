import { TIPOS_GATILHO } from '../constants.js'
import { textosDoGatilho } from '../db/conteudoRepo.js'

/**
 * Textos dos gatilhos.
 *
 * `reduzido = true` é a regra de silêncio em ação: depois de N silêncios
 * consecutivos do mesmo tipo, a mensagem fica mais curta e MENOS exigente.
 * Nunca mais cobrada — quem já está sumindo não precisa de mais pressão.
 */

/**
 * Check-in matinal com enquadramento BINÁRIO, de propósito.
 * "Como você está?" é caro de responder de manhã para o público-alvo;
 * escolher entre duas opções não é.
 */
export const TEXTO_CHECKIN_MANHA = `Bom dia.

Modo normal ou modo disfunção hoje?

(É só isso. Uma palavra serve.)`

export const TEXTO_CHECKIN_MANHA_REDUZIDO = 'Bom dia. Modo normal ou modo disfunção hoje?'

export function mensagemCheckinManha(reduzido = false, textos = {}) {
  return reduzido
    ? (textos.reduzido ?? TEXTO_CHECKIN_MANHA_REDUZIDO)
    : (textos.normal ?? TEXTO_CHECKIN_MANHA)
}

/**
 * O nome do remédio entra por MARCADOR, não por interpolação direta.
 *
 * É o que permite o texto virar conteúdo editável sem que a edição possa apagar
 * o nome do remédio da mensagem — o repositório recusa gravar esta chave sem
 * `{remedio}`.
 */
export const MARCADOR_REMEDIO = '{remedio}'

export const TEXTO_REMEDIO = `Hora do ${MARCADOR_REMEDIO}.`

export function mensagemRemedio(nomeRemedio, texto = TEXTO_REMEDIO) {
  return texto.replaceAll(MARCADOR_REMEDIO, nomeRemedio)
}

export const TEXTO_CHECKLIST_FIM_DIA = `Fechando o dia.

Teve alguma coisa que andou hoje? Pode ser pequena — conta do mesmo jeito.`

export const TEXTO_CHECKLIST_FIM_DIA_REDUZIDO = 'Fechando o dia. Teve alguma coisa que andou?'

export function mensagemChecklistFimDia(reduzido = false, textos = {}) {
  return reduzido
    ? (textos.reduzido ?? TEXTO_CHECKLIST_FIM_DIA_REDUZIDO)
    : (textos.normal ?? TEXTO_CHECKLIST_FIM_DIA)
}

/**
 * Dispatcher de mensagem de gatilho.
 * @param {string} tipo um de TIPOS_GATILHO
 * @param {{reduzido?: boolean, nomeRemedio?: string}} opcoes
 */
export function montarMensagemGatilho(tipo, { reduzido = false, nomeRemedio } = {}) {
  // O texto vem do conteúdo versionado; a constante deste arquivo é o padrão de
  // fábrica e o socorro quando a leitura falhar. Gatilho que não sai por causa de
  // um problema de banco é pior que gatilho com o texto de fábrica.
  let textos = {}
  try {
    textos = textosDoGatilho(tipo)
  } catch (e) {
    console.warn('[gatilhos] conteúdo versionado indisponível; usando o padrão:', e?.message ?? e)
  }

  switch (tipo) {
    case TIPOS_GATILHO.CHECKIN_MANHA:
      return mensagemCheckinManha(reduzido, textos)
    case TIPOS_GATILHO.REMEDIO:
      return mensagemRemedio(nomeRemedio, textos.normal ?? TEXTO_REMEDIO)
    case TIPOS_GATILHO.CHECKLIST_FIM_DIA:
      return mensagemChecklistFimDia(reduzido, textos)
    default:
      throw new Error(`Tipo de gatilho desconhecido: ${tipo}`)
  }
}
