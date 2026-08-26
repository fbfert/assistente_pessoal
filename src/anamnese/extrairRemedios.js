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

/**
 * Há indício de medicação neste texto?
 *
 * PORTÃO, não decisão: serve só para escolher se vale gastar uma chamada de LLM
 * na conversa livre. Quem decide o que é remédio continua sendo o extrator, com
 * o prompt estrito e a Regra 1b. Por isso aqui é busca por palavra, e não a
 * igualdade exata contra `Set` que a máquina de estados exige — lá o custo de
 * errar é gravar no campo errado; aqui é uma chamada à toa.
 *
 * Errar para o lado de chamar é barato. Errar para o outro mantém exatamente o
 * comportamento de antes: nada é gravado.
 *
 * @param {string} texto
 * @param {Array<{nome: string}>} remediosConhecidos os já cadastrados da pessoa
 */
export function temIndicioDeRemedio(texto, remediosConhecidos = []) {
  const t = normalizarTexto(texto)
  if (!t) return false

  const termos = [
    ...TERMOS_DE_MEDICACAO,
    // O nome que a pessoa já usa é o indício mais forte que existe para ela.
    ...remediosConhecidos
      .map((r) => normalizarTexto(r?.nome))
      .filter((n) => n && n !== normalizarTexto(SEM_INFORMACAO) && n.length >= 3),
  ]

  return termos.some((termo) => new RegExp(`\\b${escapar(termo)}\\b`).test(t))
}

const TERMOS_DE_MEDICACAO = Object.freeze([
  'remedio', 'remedios', 'medicamento', 'medicamentos', 'medicacao',
  'comprimido', 'comprimidos', 'capsula', 'capsulas', 'pilula', 'pilulas',
  'dose', 'doses', 'mg', 'ml', 'gotas',
  'tomar', 'tomo', 'tomei', 'tomando',
])

const normalizarTexto = (v) =>
  String(v ?? '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim()

const escapar = (v) => v.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
