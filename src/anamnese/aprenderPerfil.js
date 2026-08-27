import { chamarLLM } from '../llm/router.js'
import { promptExtracaoAprendizado } from '../llm/prompts.js'
import { CAMPOS_APRENDIVEIS } from '../db/userRepo.js'
import { SEM_INFORMACAO } from '../constants.js'

/**
 * Extrai APRENDIZADO DE PERFIL de uma mensagem de conversa livre.
 *
 * Mesmo padrão de `extrairRemedios.js`: prompt estrito, `chamar` injetável,
 * parse defensivo. Falha nunca lança — vira "não aprendeu nada". Perder uma nota
 * é recuperável (a pessoa repete, ou o operador anota); derrubar a resposta dela
 * não é.
 *
 * O risco aqui NÃO é o da Regra 1b. Lá o perigo é inventar dado que não foi
 * dito; aqui é generalizar dado que foi dito — transformar "hoje o trânsito me
 * deixou louco" num traço permanente do perfil. Um traço falso não parece falso:
 * entra em toda mensagem seguinte como se a pessoa tivesse dito aquilo de si.
 *
 * Remédio não passa por aqui em hipótese alguma. Isso é `extrairRemedios`, que
 * tem tratamento de Regra 1b específico para dado de saúde regulado.
 *
 * @param {string} mensagem
 * @param {string} perfilConhecido texto do que já se sabe, para não reaprender
 * @param {{chamar?: Function}} deps
 * @returns {Promise<{aprendeu: boolean, campo: string|null, texto: string|null}>}
 */
export async function extrairAprendizado(mensagem, perfilConhecido = '', deps = {}) {
  const chamar = deps.chamar ?? chamarLLM

  let bruto
  try {
    bruto = await chamar({
      systemPrompt:
        'Você extrai dados estruturados e é extremamente conservador. Responde só com JSON válido.',
      mensagens: [
        {
          role: 'user',
          content: promptExtracaoAprendizado(mensagem, perfilConhecido, CAMPOS_APRENDIVEIS),
        },
      ],
    })
  } catch {
    return NADA
  }

  return parsearAprendizado(bruto)
}

const NADA = Object.freeze({ aprendeu: false, campo: null, texto: null })

/** Parse puro da resposta do LLM. Exportado para teste sem rede. */
export function parsearAprendizado(bruto) {
  if (typeof bruto !== 'string') return NADA

  // Alguns modelos devolvem o JSON dentro de cerca de código apesar da instrução.
  const semCerca = bruto.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')

  let dados
  try {
    dados = JSON.parse(semCerca)
  } catch {
    return NADA
  }

  if (!dados || typeof dados !== 'object' || dados.aprendeu !== true) return NADA

  const campo = typeof dados.campo === 'string' ? dados.campo.trim() : ''
  const texto = typeof dados.texto === 'string' ? dados.texto.trim() : ''

  // Campo fora da whitelist — inclusive `nome` e qualquer coisa de remédio —
  // vira "não aprendeu nada". O modelo não escolhe onde escrever.
  if (!CAMPOS_APRENDIVEIS.includes(campo)) return NADA
  if (!texto || texto === SEM_INFORMACAO) return NADA

  return { aprendeu: true, campo, texto }
}
