import 'dotenv/config'
import { dirname, join } from 'node:path'
import { modeloTranscricao } from './llm/chavesRepo.js'

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

    // Credenciais configuráveis pela tela do admin.
    //
    // Arquivo, não variável de ambiente: `env_file` é lido UMA vez na subida do
    // container, então escrever num `.env` de dentro do processo não alcança o
    // outro container nem sobrevive a um rebuild. Fica ao lado do banco, dentro
    // do volume que os dois processos compartilham.
    //
    // O `.env` continua valendo como fallback — ninguém é obrigado a migrar.
    chavesPath:
      process.env.LLM_CHAVES_PATH || join(dirname(process.env.DB_PATH || './data/tars.sqlite'), 'llm-chaves.json'),
  },

  transcription: {
    // Sempre OpenAI, independente de llm.defaultProvider — e com a MESMA chave
    // da seção OpenAI, que é a mesma conta desde o primeiro dia. O que a tela
    // configura é só o modelo.
    apiKey: process.env.OPENAI_API_KEY || '',

    /** Padrão do ambiente/código. A leitura viva é `model`, logo abaixo. */
    modelPadrao: process.env.TRANSCRIPTION_MODEL || 'gpt-4o-transcribe',

    /**
     * Modelo vigente: arquivo de credenciais primeiro, padrão depois — a mesma
     * ordem de dois degraus da chave e do modelo de conversa.
     *
     * É getter, e não valor, porque o arquivo muda sem reinício: lido uma vez na
     * subida, trocar o modelo pela tela não alcançaria este processo, e o
     * operador veria na tela um valor que a transcrição não está usando.
     *
     * O import de `chavesRepo` fecha um ciclo com este arquivo (ele lê
     * `config.llm.chavesPath`). É seguro porque nenhum dos dois lados toca no
     * outro durante a avaliação do módulo — só dentro de função.
     */
    get model() {
      return modeloTranscricao(this.modelPadrao)
    },

    language: process.env.TRANSCRIPTION_LANGUAGE || 'pt',
    baseUrl: 'https://api.openai.com/v1/audio/transcriptions',
  },

  /**
   * Canal web — servidor PÚBLICO, dentro do processo do bot.
   *
   * É a primeira porta deste projeto alcançável sem túnel: o admin sempre esteve
   * em loopback. Por isso o servidor é separado do dele, em porta própria — uma
   * rota mal configurada aqui não tem como alcançar dado administrativo.
   */
  web: {
    port: num(process.env.WEB_PORT, 3400),
    host: process.env.WEB_HOST || '127.0.0.1',

    /** Inatividade até a sessão expirar. Renovada a cada requisição válida. */
    sessaoHoras: num(process.env.WEB_SESSAO_HORAS, 6),

    /** Limite de tentativas de entrada — por origem E por telefone. */
    maxTentativas: num(process.env.WEB_MAX_TENTATIVAS, 5),
    bloqueioMinutos: num(process.env.WEB_BLOQUEIO_MINUTOS, 15),

    /**
     * Atraso fixo a cada falha de entrada. É a defesa que NÃO se contorna, por
     * não depender de identificar a origem — baixar isto em produção enfraquece
     * o sistema de verdade. Configurável para que a suíte não gaste um segundo
     * por tentativa testada.
     */
    atrasoFalhaMs: num(process.env.WEB_ATRASO_FALHA_MS, 1000),
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
    //
    // O padrão 127.0.0.1 vale para execução direta no host. DENTRO de um
    // container, 127.0.0.1 é o loopback DO CONTAINER — o mapeamento de porta
    // do Docker não consegue alcançá-lo, e o dashboard fica inacessível. Lá o
    // processo escuta 0.0.0.0 e quem garante o loopback é o bind do Compose
    // ("127.0.0.1:3300:3300"). A garantia de segurança é a mesma; muda só onde
    // ela é aplicada.
    host: process.env.DASHBOARD_HOST || '127.0.0.1',

    // Senha do backend administrativo.
    //
    // Fica sob `dashboard` e NAO sob um `config.admin` novo de proposito: o
    // modulo continua sendo o mesmo processo, mesma porta e mesmo bind. Criar
    // um segundo namespace obrigaria a renomear DASHBOARD_HOST/DASHBOARD_PORT
    // em .env.example, docker-compose.yml, README e no container que ja esta
    // rodando -- churn sem ganho, com risco de deixar as duas formas
    // coexistindo por acidente.
    // Semente do BOOTSTRAP, não credencial de login. Depois que a conta
    // inicial existe, entrar é por e-mail + senha da conta. Manter os dois
    // caminhos vivos seria o pior dos dois mundos: uma senha compartilhada e
    // eterna convivendo com contas nominais, e a identificação sumindo sem
    // ninguém notar.
    adminPassword: process.env.ADMIN_PASSWORD || '',
    bootstrapEmail: process.env.ADMIN_BOOTSTRAP_EMAIL || '',
  },

  // Os dois números "no chute" do piloto. Existem como env justamente porque
  // não há base empírica para nenhum dos dois — o piloto é que vai calibrá-los.
  respostaGatilhoJanelaMin: num(process.env.RESPOSTA_GATILHO_JANELA_MIN, 120),
  silenciosAteReduzirTom: num(process.env.SILENCIOS_ATE_REDUZIR_TOM, 3),
}

export default config
