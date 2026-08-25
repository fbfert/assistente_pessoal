import { config } from '../config.js'

export const PROVIDERS_DISPONIVEIS = Object.freeze(['claude', 'openai', 'deepseek'])

/**
 * Chamada única de LLM, despachada para o provedor escolhido.
 *
 * Trocar de provedor é variável de ambiente (LLM_PROVIDER) — nenhum chamador
 * precisa saber qual API está por baixo.
 *
 * @param {{systemPrompt: string, mensagens: Array<{role: string, content: string}>, provider?: string, maxTokens?: number}} opcoes
 * @returns {Promise<string>} texto da resposta
 */
export async function chamarLLM({
  systemPrompt,
  mensagens = [],
  provider = config.llm.defaultProvider,
  maxTokens = config.llm.maxTokens,
}) {
  if (!PROVIDERS_DISPONIVEIS.includes(provider)) {
    throw new Error(
      `Provedor de LLM desconhecido: "${provider}". Disponíveis: ${PROVIDERS_DISPONIVEIS.join(', ')}`,
    )
  }

  if (provider === 'claude') return chamarClaude({ systemPrompt, mensagens, maxTokens })
  return chamarCompativelOpenAI({ systemPrompt, mensagens, maxTokens, provider })
}

/** Anthropic Messages API: x-api-key + anthropic-version, system fora do array de mensagens. */
async function chamarClaude({ systemPrompt, mensagens, maxTokens }) {
  const { apiKey, model, baseUrl, version } = config.llm.claude
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY não configurada')

  const resposta = await fetch(baseUrl, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': version,
    },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      system: systemPrompt,
      messages: mensagens,
    }),
  })

  if (!resposta.ok) {
    throw new Error(`Anthropic respondeu ${resposta.status}: ${await resposta.text()}`)
  }

  return extrairTextoClaude(await resposta.json())
}

/**
 * OpenAI e DeepSeek compartilham o formato /chat/completions com Bearer.
 * Uma implementação só — a diferença entre eles é URL, chave e modelo.
 */
async function chamarCompativelOpenAI({ systemPrompt, mensagens, maxTokens, provider }) {
  const { apiKey, model, baseUrl } = config.llm[provider]
  if (!apiKey) throw new Error(`Chave de API do provedor "${provider}" não configurada`)

  const resposta = await fetch(baseUrl, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      messages: [{ role: 'system', content: systemPrompt }, ...mensagens],
    }),
  })

  if (!resposta.ok) {
    throw new Error(`Provedor "${provider}" respondeu ${resposta.status}: ${await resposta.text()}`)
  }

  return extrairTextoOpenAI(await resposta.json())
}

// --- Parsing das respostas (puro, testável sem rede) -------------------------

export function extrairTextoClaude(corpo) {
  const blocos = Array.isArray(corpo?.content) ? corpo.content : []
  return blocos
    .filter((b) => b?.type === 'text' && typeof b.text === 'string')
    .map((b) => b.text)
    .join('')
    .trim()
}

export function extrairTextoOpenAI(corpo) {
  return (corpo?.choices?.[0]?.message?.content ?? '').trim()
}
