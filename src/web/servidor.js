import express from 'express'
import { timingSafeEqual } from 'node:crypto'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { config } from '../config.js'
import { CANAIS, TIPOS_INTERACAO } from '../constants.js'
import * as repo from '../db/userRepo.js'
import * as sessoes from '../db/sessaoWebRepo.js'
import { listarConversa, registrar } from '../db/interactionLog.js'
import { ESTADOS, TEXTO_CONSENTIMENTO } from '../anamnese/questions.js'
import { processarMensagem } from '../conversa/nucleo.js'
import { bloqueado, registrarFalha, limpar } from './tentativas.js'

/**
 * CANAL WEB — o servidor público, dentro do processo do bot.
 *
 * Separado do admin de propósito: outro Express, outra porta. O admin serve dado
 * de saúde de todo mundo e vive em loopback; este é alcançável da internet. Uma
 * rota mal configurada aqui não tem como alcançar aquilo — separar processos e
 * portas transforma um erro improvável num erro impossível.
 *
 * O que este arquivo NÃO faz: decidir o que responder. Isso é do núcleo
 * (`src/conversa/nucleo.js`), o mesmo que o WhatsApp usa. Aqui só se identifica
 * a pessoa e se entrega uma função de envio.
 *
 * Nenhuma rota lista participantes, expõe dado de terceiro ou faz operação
 * administrativa. Não há caminho de criação de usuário: quem não foi convidado
 * não entra, e ponto.
 */

const PUBLICO = join(dirname(fileURLToPath(import.meta.url)), 'publico')

/**
 * Quantas mensagens a conversa anterior devolve.
 *
 * Contagem, e não recorte por tempo: corte por tempo pune exatamente quem este
 * produto atende — quem some por três dias e volta. Cinquenta cobre a anamnese
 * inteira (uns 25 turnos) ou alguns dias de chat livre.
 */
const MENSAGENS_NO_HISTORICO = 50

/** Resposta ÚNICA de falha de entrada. Ver `mesmaFalha`, abaixo. */
const FALHA_ENTRADA = { erro: 'Telefone ou data de nascimento não conferem.' }

/**
 * A mesma resposta para todas as causas: telefone inexistente, data errada, e
 * participante sem data cadastrada.
 *
 * Distinguir transformaria a rota num verificador de quem está no piloto — e
 * participar deste piloto é, por si só, informação de saúde.
 */
const mesmaFalha = (res) => res.status(401).json(FALHA_ENTRADA)

/** Comparação de tamanho constante, tolerante a formatos diferentes de data. */
function dataConfere(informada, guardada) {
  const a = Buffer.from(String(informada ?? '').trim())
  const b = Buffer.from(String(guardada ?? '').trim())

  // Comprimentos diferentes vazam por si sós; iguala o trabalho mesmo assim.
  if (a.length !== b.length || a.length === 0) {
    timingSafeEqual(Buffer.alloc(32), Buffer.alloc(32))
    return false
  }
  return timingSafeEqual(a, b)
}

const tokenDaRequisicao = (req) => {
  const bruto = req.headers?.authorization ?? ''
  const [esquema, valor] = String(bruto).split(' ')
  return esquema?.toLowerCase() === 'bearer' && valor ? valor : null
}

export function criarAppWeb(db) {
  const app = express()

  // Atrás do proxy reverso, `req.ip` só é o cliente com isto ligado. O endereço
  // continua forjável no cabeçalho — é exatamente por isso que existe a segunda
  // contagem, por telefone, que não se forja.
  app.set('trust proxy', true)
  app.disable('x-powered-by')
  app.use(express.json({ limit: '32kb' }))

  /**
   * Cabeçalhos da página pública.
   *
   * A CSP com `'self'` em tudo é o que dá dente à regra de "nenhum recurso de
   * origem externa": não é convenção que o próximo agente possa quebrar sem
   * perceber — o navegador recusa. É também por isso que o script e o estilo
   * estão em arquivos, e não embutidos: `'unsafe-inline'` abriria justamente o
   * buraco que a política existe para fechar.
   */
  app.use((_req, res, next) => {
    res.setHeader(
      'Content-Security-Policy',
      "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; " +
        "img-src 'self' data:; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
    )
    res.setHeader('X-Content-Type-Options', 'nosniff')
    res.setHeader('Referrer-Policy', 'no-referrer')
    next()
  })

  // A página. Estática, servida pelo mesmo processo — sem depender do dashboard
  // nem da autenticação de admin.
  app.use(express.static(PUBLICO, { index: 'index.html', extensions: false }))

  // --- Entrada -----------------------------------------------------------------

  app.post('/web/entrar', async (req, res) => {
    const telefone = repo.soDigitos(req.body?.telefone)
    const dataNascimento = String(req.body?.dataNascimento ?? '').trim()
    const origem = req.ip ?? 'desconhecida'

    if (!telefone || !dataNascimento) return mesmaFalha(res)

    const minutos = bloqueado({ origem, telefone })
    if (minutos) {
      return res.status(429).json({
        erro: `Muitas tentativas. Tente de novo em ${minutos} minuto(s).`,
      })
    }

    const usuario = repo.findByTelefone(telefone, db)

    // NUNCA cria participante. Sem convite, não há entrada — as três causas de
    // recusa devolvem exatamente a mesma coisa.
    const ok =
      usuario &&
      usuario.anamnese_estado !== null &&
      usuario.data_nascimento &&
      dataConfere(dataNascimento, usuario.data_nascimento)

    if (!ok) {
      await registrarFalha({ origem, telefone })
      return mesmaFalha(res)
    }

    limpar({ origem, telefone })

    const { token, expiraEm } = sessoes.criar(usuario.usuario_id, db)

    registrar(
      {
        usuarioId: usuario.usuario_id,
        tipo: TIPOS_INTERACAO.ENTRADA_WEB,
        texto: 'entrada no canal web',
        canal: CANAIS.WEB,
      },
      db,
    )

    // Só o necessário para a tela funcionar: a credencial, quando ela vence, e —
    // para quem ainda não consentiu — o texto de consentimento, que é conteúdo
    // do produto, não dado da pessoa. Nada de nome, estado ou histórico.
    res.json({
      token,
      expiraEm,
      mensagemInicial:
        usuario.anamnese_estado === ESTADOS.CONSENTIMENTO ? TEXTO_CONSENTIMENTO : null,
    })
  })

  // --- Conversa anterior ---------------------------------------------------------

  /**
   * A conversa que a pessoa já teve, para ela mesma.
   *
   * Primeira rota do canal web que DEVOLVE dado de saúde — até aqui a página só
   * recebia o turno corrente. Por isso a identidade vem exclusivamente da
   * sessão, e o que sai passa por lista fechada de tipos permitidos em
   * `listarConversa`: resposta bloqueada por segurança, nota de aprendizado e
   * registro interno não têm como escapar por aqui.
   */
  app.get('/web/historico', (req, res) => {
    const usuarioId = sessoes.validar(tokenDaRequisicao(req), db)
    if (!usuarioId) {
      return res.status(401).json({ erro: 'Sessão inválida ou expirada. Entre de novo.' })
    }

    res.json({ mensagens: listarConversa(usuarioId, MENSAGENS_NO_HISTORICO, db) })
  })

  // --- Mensagem ----------------------------------------------------------------

  app.post('/web/mensagem', async (req, res) => {
    const usuarioId = sessoes.validar(tokenDaRequisicao(req), db)
    if (!usuarioId) {
      return res.status(401).json({ erro: 'Sessão inválida ou expirada. Entre de novo.' })
    }

    const texto = String(req.body?.texto ?? '').trim()
    if (!texto) return res.status(400).json({ erro: 'Mensagem vazia.' })

    // A identidade vem da SESSÃO. Qualquer campo do corpo que tente indicar outro
    // participante é ignorado por construção: nada aqui lê identificador do corpo.
    const usuario = repo.findById(usuarioId, db)
    if (!usuario) return res.status(401).json({ erro: 'Sessão inválida ou expirada.' })

    const respostas = []
    const responder = async (t) => {
      respostas.push(t)
    }

    await processarMensagem({ usuario, texto, canal: CANAIS.WEB, responder }, { db })

    res.json({ respostas })
  })

  // Erro em qualquer rota vira 500 sem corpo revelador — e sem derrubar o
  // processo, que também está conversando no WhatsApp.
  app.use((erro, _req, res, _next) => {
    console.error('[web] erro na requisição:', erro?.message ?? erro)
    res.status(500).json({ erro: 'Falha interna.' })
  })

  return app
}

/**
 * Sobe o servidor. Falha ao escutar NÃO derruba o processo: o WhatsApp e o
 * scheduler continuam, e o canal web fica indisponível — que é muito melhor que
 * o inverso.
 */
export function iniciarCanalWeb(db) {
  const app = criarAppWeb(db)

  const servidor = app.listen(config.web.port, config.web.host, () => {
    console.log(`[web] canal público em http://${config.web.host}:${config.web.port}`)
  })

  servidor.on('error', (e) => {
    console.error(`[web] não foi possível escutar em ${config.web.port}:`, e?.message ?? e)
  })

  return servidor
}
