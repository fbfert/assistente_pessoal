import { config } from '../config.js'
import { ler, lerAtivo } from './chavesRepo.js'

export const PROVIDERS_DISPONIVEIS = Object.freeze(['claude', 'openai', 'deepseek'])

/**
 * Provedor ativo na conversa: arquivo de credenciais primeiro, ambiente depois.
 *
 * É função, não constante, porque o arquivo muda sem reinício — congelar o valor
 * na subida faria a troca pela tela não alcançar este processo.
 */
export function providerAtivo() {
  return lerAtivo() ?? config.llm.defaultProvider
}

/**
 * Chamada única de LLM, despachada para o provedor escolhido.
 *
 * Trocar de provedor é a tela de credenciais (ou `LLM_PROVIDER`) — nenhum
 * chamador precisa saber qual API está por baixo.
 *
 * `credencial` existe para UM caso: o botão de testar do admin, que precisa
 * validar uma chave que o operador acabou de digitar e ainda NÃO gravou. Nenhum
 * caminho de conversa a usa — o padrão continua sendo resolver do arquivo/ambiente.
 *
 * @param {{systemPrompt: string, mensagens: Array<{role: string, content: string}>, provider?: string, maxTokens?: number, credencial?: {apiKey?: string, model?: string}}} opcoes
 * @returns {Promise<string>} texto da resposta
 */
export async function chamarLLM({
  systemPrompt,
  mensagens = [],
  provider = providerAtivo(),
  maxTokens = config.llm.maxTokens,
  credencial = null,
}) {
  if (!PROVIDERS_DISPONIVEIS.includes(provider)) {
    throw new Error(
      `Provedor de LLM desconhecido: "${provider}". Disponíveis: ${PROVIDERS_DISPONIVEIS.join(', ')}`,
    )
  }

  if (provider === 'claude') return chamarClaude({ systemPrompt, mensagens, maxTokens, credencial })
  return chamarCompativelOpenAI({ systemPrompt, mensagens, maxTokens, provider, credencial })
}

/**
 * Resolve chave e modelo em DOIS degraus: credencial configurada pela tela,
 * depois variável de ambiente.
 *
 * Não há terceiro degrau. A configuração comum do projeto tem constante de
 * fábrica no código; uma credencial não tem — e não deveria.
 */
function credenciais(provider, rascunho = null) {
  const doArquivo = ler(provider)
  const doAmbiente = config.llm[provider]

  const apiKey = rascunho?.apiKey || doArquivo?.apiKey || doAmbiente.apiKey
  const model = rascunho?.model || doArquivo?.model || doAmbiente.model

  if (!apiKey) {
    // Erro explícito de propósito: falhar em silêncio, ou cair noutro provedor
    // por conta própria, faria o piloto responder com um modelo que ninguém
    // escolheu.
    throw new Error(
      `Nenhuma credencial para o provedor "${provider}". ` +
        `Configure em /credenciais no admin, ou defina ${VARIAVEIS[provider]} no ambiente.`,
    )
  }

  return { apiKey, model, baseUrl: doAmbiente.baseUrl, version: doAmbiente.version }
}

const VARIAVEIS = Object.freeze({
  claude: 'ANTHROPIC_API_KEY',
  openai: 'OPENAI_API_KEY',
  deepseek: 'DEEPSEEK_API_KEY',
})

/**
 * Erro de provedor SEM o corpo da resposta.
 *
 * Alguns provedores ecoam a credencial recebida no corpo do 401. Incluir o corpo
 * na exceção colocaria a chave no log do Docker sem ninguém ter pedido.
 *
 * O corpo é descartado INTEIRO, não filtrado: filtrar exigiria acertar o formato
 * de erro de cada provedor a cada mudança de API, e errar uma vez basta para
 * vazar. Perde-se detalhe de diagnóstico — o código de status distingue os casos
 * que importam (401 credencial, 429 cota, 5xx provedor fora).
 */
function erroDeProvedor(provider, status) {
  return new Error(`Provedor "${provider}" respondeu ${status}${pistaDeStatus(status)}`)
}

/**
 * Tradução do código de status para linguagem de operador.
 *
 * Exportada porque a transcrição precisa da mesma leitura, e duplicar a tabela
 * faria uma das duas envelhecer sozinha. O 402 entrou depois de aparecer em
 * produção: a chave autenticava e a conta estava sem saldo, e um "respondeu 402"
 * pelado não diz isso a ninguém.
 */
export function pistaDeStatus(status) {
  if (status === 401 || status === 403) return ' (falha ao autenticar — confira a credencial)'
  if (status === 402) return ' (pagamento pendente ou saldo esgotado na conta do provedor)'
  if (status === 429) return ' (limite de uso ou cota)'
  if (status >= 500) return ' (o provedor está fora do ar)'
  return ''
}

/** Anthropic Messages API: x-api-key + anthropic-version, system fora do array de mensagens. */
async function chamarClaude({ systemPrompt, mensagens, maxTokens, credencial = null }) {
  const { apiKey, model, baseUrl, version } = credenciais('claude', credencial)

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

  if (!resposta.ok) throw erroDeProvedor('claude', resposta.status)

  return extrairTextoClaude(await resposta.json())
}

/**
 * OpenAI e DeepSeek compartilham o formato /chat/completions com Bearer.
 * Uma implementação só — a diferença entre eles é URL, chave e modelo.
 */
async function chamarCompativelOpenAI({ systemPrompt, mensagens, maxTokens, provider, credencial = null }) {
  const { apiKey, model, baseUrl } = credenciais(provider, credencial)

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

  if (!resposta.ok) throw erroDeProvedor(provider, resposta.status)

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
