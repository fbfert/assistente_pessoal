import { TIPOS_INTERACAO } from '../constants.js'

const MS_POR_MINUTO = 60_000

/**
 * Classifica uma mensagem recebida como resposta a gatilho ou despejo espontâneo.
 *
 * Função PURA: sem LLM e sem banco. Uma chamada de modelo por mensagem só para
 * rotular a mensagem seria custo recorrente sem retorno de produto.
 *
 * SIMPLIFICAÇÃO ACEITA: não distingue a 1ª da 2ª mensagem dentro da mesma
 * janela — as duas contam como resposta ao mesmo gatilho. Na escala do piloto
 * (5 pessoas) a distinção não muda nenhuma decisão de produto.
 *
 * O limite da janela é INCLUSIVO: exatamente `janelaMinutos` ainda conta como
 * resposta. Decisão arbitrária, documentada aqui e coberta por teste para que
 * ninguém a redescubra por acidente.
 *
 * @param {Date|string|number} agora instante da mensagem recebida
 * @param {{timestamp: string}|null} ultimoGatilho último gatilho disparado, ou null
 * @param {number} janelaMinutos
 * @returns {'resposta_gatilho'|'despejo_espontaneo'}
 */
export function classificarMensagem(agora, ultimoGatilho, janelaMinutos) {
  if (!ultimoGatilho?.timestamp) return TIPOS_INTERACAO.DESPEJO_ESPONTANEO

  const tGatilho = new Date(ultimoGatilho.timestamp).getTime()
  const tAgora = new Date(agora).getTime()

  if (!Number.isFinite(tGatilho) || !Number.isFinite(tAgora)) {
    return TIPOS_INTERACAO.DESPEJO_ESPONTANEO
  }

  const decorridoMin = (tAgora - tGatilho) / MS_POR_MINUTO

  // Mensagem anterior ao gatilho (relógio torto, log fora de ordem) não é resposta a ele.
  if (decorridoMin < 0) return TIPOS_INTERACAO.DESPEJO_ESPONTANEO

  return decorridoMin <= janelaMinutos
    ? TIPOS_INTERACAO.RESPOSTA_GATILHO
    : TIPOS_INTERACAO.DESPEJO_ESPONTANEO
}
