import { TIPOS_GATILHO } from '../constants.js'

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
export function mensagemCheckinManha(reduzido = false) {
  if (reduzido) return 'Bom dia. Modo normal ou modo disfunção hoje?'

  return `Bom dia.

Modo normal ou modo disfunção hoje?

(É só isso. Uma palavra serve.)`
}

export function mensagemRemedio(nomeRemedio) {
  return `Hora do ${nomeRemedio}.`
}

export function mensagemChecklistFimDia(reduzido = false) {
  if (reduzido) return 'Fechando o dia. Teve alguma coisa que andou?'

  return `Fechando o dia.

Teve alguma coisa que andou hoje? Pode ser pequena — conta do mesmo jeito.`
}

/**
 * Dispatcher de mensagem de gatilho.
 * @param {string} tipo um de TIPOS_GATILHO
 * @param {{reduzido?: boolean, nomeRemedio?: string}} opcoes
 */
export function montarMensagemGatilho(tipo, { reduzido = false, nomeRemedio } = {}) {
  switch (tipo) {
    case TIPOS_GATILHO.CHECKIN_MANHA:
      return mensagemCheckinManha(reduzido)
    case TIPOS_GATILHO.REMEDIO:
      return mensagemRemedio(nomeRemedio)
    case TIPOS_GATILHO.CHECKLIST_FIM_DIA:
      return mensagemChecklistFimDia(reduzido)
    default:
      throw new Error(`Tipo de gatilho desconhecido: ${tipo}`)
  }
}
