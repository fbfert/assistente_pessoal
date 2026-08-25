import 'dotenv/config'

/**
 * Configuração única do app. Todo o resto lê daqui — nenhum módulo acessa
 * process.env diretamente, para que trocar de provedor ou de janela seja
 * mexer em um lugar só.
 */

const num = (valor, padrao) => {
  const n = Number.parseInt(valor ?? '', 10)
  return Number.isFinite(n) ? n : padrao
}

export const config = {
  llm: {
    defaultProvider: process.env.LLM_PROVIDER || 'claude',
    claude: {
      apiKey: process.env.ANTHROPIC_API_KEY || '',
      model: process.env.ANTHROPIC_MODEL || 'claude-sonnet-5',
      baseUrl: 'https://api.anthropic.com/v1/messages',
      version: '2023-06-01',
    },
    openai: {
      apiKey: process.env.OPENAI_API_KEY || '',
      model: process.env.OPENAI_MODEL || 'gpt-4o',
      baseUrl: 'https://api.openai.com/v1/chat/completions',
    },
    deepseek: {
      apiKey: process.env.DEEPSEEK_API_KEY || '',
      model: process.env.DEEPSEEK_MODEL || 'deepseek-chat',
      baseUrl: 'https://api.deepseek.com/chat/completions',
    },
    maxTokens: num(process.env.LLM_MAX_TOKENS, 1024),
  },

  transcription: {
    // Sempre OpenAI, independente de llm.defaultProvider.
    apiKey: process.env.OPENAI_API_KEY || '',
    model: process.env.TRANSCRIPTION_MODEL || 'gpt-4o-transcribe',
    language: process.env.TRANSCRIPTION_LANGUAGE || 'pt',
    baseUrl: 'https://api.openai.com/v1/audio/transcriptions',
  },

  timezone: process.env.TZ || 'America/Sao_Paulo',

  db: {
    path: process.env.DB_PATH || './data/tars.sqlite',
  },

  auth: {
    dir: process.env.WHATSAPP_AUTH_DIR || './auth',
  },

  dashboard: {
    port: num(process.env.DASHBOARD_PORT, 3300),
    // Decisão de segurança, não detalhe: o dashboard mostra dado de saúde de
    // pessoas identificadas e não tem autenticação. Acesso é por túnel SSH.
    host: '127.0.0.1',
  },

  // Os dois números "no chute" do piloto. Existem como env justamente porque
  // não há base empírica para nenhum dos dois — o piloto é que vai calibrá-los.
  respostaGatilhoJanelaMin: num(process.env.RESPOSTA_GATILHO_JANELA_MIN, 120),
  silenciosAteReduzirTom: num(process.env.SILENCIOS_ATE_REDUZIR_TOM, 3),
}

export default config
