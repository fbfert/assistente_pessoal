import { chamarLLM } from '../llm/router.js'
import { promptExtracaoRemedios } from '../llm/prompts.js'
import { SEM_INFORMACAO } from '../constants.js'

/**
 * Extrai remédios do texto do usuário (estado 6 da anamnese).
 *
 * REGRA 1b: o prompt proíbe inventar ou estimar nome, dose e horário, e o parse
 * abaixo nunca preenche um campo ausente com palpite — só com SEM_INFORMACAO.
 *
 * Parse defensivo: se o LLM devolver algo que não é JSON, retorna [] em vez de
 * lançar. Perder um remédio é recuperável (a pessoa repete); derrubar a
 * anamnese no meio não é.
 *
 * @param {string} texto
 * @param {{chamar?: Function}} deps `chamar` injetável para teste sem rede
 * @returns {Promise<Array<{nome: string, horario: string}>>}
 */
export async function extrairRemedios(texto, deps = {}) {
  const chamar = deps.chamar ?? chamarLLM

  let bruto
  try {
    bruto = await chamar({
      systemPrompt: 'Você extrai dados estruturados. Responde só com JSON válido.',
      mensagens: [{ role: 'user', content: promptExtracaoRemedios(texto) }],
    })
  } catch {
    return []
  }

  return parsearRemedios(bruto)
}

/** Parse puro da resposta do LLM. Exportado para teste sem rede. */
export function parsearRemedios(bruto) {
  if (typeof bruto !== 'string') return []

  // Alguns modelos devolvem o JSON dentro de cerca de código apesar da instrução.
  const semCerca = bruto.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')

  let dados
  try {
    dados = JSON.parse(semCerca)
  } catch {
    return []
  }

  const lista = Array.isArray(dados) ? dados : dados?.remedios
  if (!Array.isArray(lista)) return []

  return lista
    .filter((r) => r && typeof r === 'object')
    .map((r) => ({
      nome: textoOuSentinela(r.nome),
      horario: textoOuSentinela(r.horario),
    }))
    // Um item em que NADA foi informado não é remédio nenhum — é ruído do modelo.
    .filter((r) => !(r.nome === SEM_INFORMACAO && r.horario === SEM_INFORMACAO))
}

function textoOuSentinela(valor) {
  if (typeof valor !== 'string') return SEM_INFORMACAO
  const t = valor.trim()
  return t === '' ? SEM_INFORMACAO : t
}
