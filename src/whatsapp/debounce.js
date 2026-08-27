import { config } from '../config.js'

/**
 * Agrupamento de mensagens em rajada — só no WhatsApp.
 *
 * Quem está em sobrecarga escreve em pedaços: três mensagens seguidas em dez
 * segundos. Responder cada uma multiplica o ruído justamente quando ele já é o
 * problema.
 *
 * POR QUE AQUI, e não no núcleo de conversa: agrupar é comportamento de
 * TRANSPORTE, da mesma família da transcrição de áudio e do filtro de grupo. No
 * canal web nem caberia — a rota é requisição-resposta, e segurar a requisição
 * por segundos deixaria a pessoa diante de uma tela travada; devolver vazio não
 * teria para onde mandar a resposta depois, porque a web não tem entrega
 * proativa. E lá a rajada não acontece: o cliente desabilita o envio enquanto a
 * chamada está pendente.
 *
 * BUFFER EM MEMÓRIA, por decisão registrada: se o container reiniciar dentro da
 * janela de poucos segundos, as mensagens acumuladas se perdem. A alternativa —
 * uma tabela e recuperação na subida — acrescentaria escrita no caminho quente de
 * toda mensagem recebida para cobrir um evento raro.
 */

/** usuario_id -> { timer, mensagens: string[] } */
const buffers = new Map()

/**
 * Agenda o processamento de uma mensagem, agrupando o que chegar na janela.
 *
 * Cada mensagem nova REINICIA a contagem: a janela é de silêncio depois da última,
 * não de tempo desde a primeira. É o que faz quem escreve devagar ser esperado.
 *
 * @param {number} usuarioId
 * @param {string} texto já transcrito, se veio de áudio
 * @param {(textoAgrupado: string) => Promise<void>} processar
 * @param {{segundos?: number, agendar?: Function, cancelar?: Function}} deps injetáveis
 * @returns {{agrupou: boolean, resultado?: Promise}} quando não agrupa, devolve a
 *   promessa do processamento — é o que preserva o retorno de quem chamou
 */
export function agrupar(usuarioId, texto, processar, deps = {}) {
  const segundos = deps.segundos ?? config.debounceSegundos
  const agendar = deps.agendar ?? setTimeout
  const cancelar = deps.cancelar ?? clearTimeout

  // Zero é o padrão e significa o comportamento de sempre: responde na hora.
  if (!segundos || segundos <= 0) {
    return { agrupou: false, resultado: processar(texto) }
  }

  const atual = buffers.get(usuarioId) ?? { timer: null, mensagens: [] }
  if (atual.timer) cancelar(atual.timer)

  atual.mensagens.push(texto)
  atual.timer = agendar(() => {
    const acumuladas = buffers.get(usuarioId)?.mensagens ?? []
    buffers.delete(usuarioId)

    // Concatenadas na ORDEM DE CHEGADA — inclusive o áudio, que entra transcrito
    // na posição em que chegou. Deixar áudio passar direto faria a resposta sair
    // fora de ordem em relação ao texto anterior, e a pessoa não teria como
    // entender por quê.
    // Devolve a promessa: quem injeta o agendador (teste, ou um agendador
    // diferente amanhã) consegue esperar o processamento terminar.
    if (acumuladas.length) return processar(acumuladas.join('\n'))
    return undefined
  }, segundos * 1000)

  buffers.set(usuarioId, atual)
  return { agrupou: true }
}

/** Quantas mensagens estão esperando — para teste e diagnóstico. */
export const pendentes = (usuarioId) => buffers.get(usuarioId)?.mensagens.length ?? 0

/** Só para teste: descarta buffers sem processar. */
export function _limpar() {
  for (const { timer } of buffers.values()) if (timer) clearTimeout(timer)
  buffers.clear()
}
