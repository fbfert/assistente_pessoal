import { config } from '../config.js'
import { TIPOS_INTERACAO } from '../constants.js'
import * as repo from '../db/userRepo.js'
import { registrar, ultimoGatilhoDisparado } from '../db/interactionLog.js'
import { ESTADOS, TEXTO_CONSENTIMENTO } from '../anamnese/questions.js'
import { processarResposta } from '../anamnese/stateMachine.js'
import { aplicarPlano } from '../anamnese/aplicarPlano.js'
import { extrairRemedios } from '../anamnese/extrairRemedios.js'
import { classificarMensagem } from '../classify/heuristic.js'
import { montarSystemPrompt } from '../llm/prompts.js'
import { chamarLLM } from '../llm/router.js'
import { transcreverAudio } from '../transcription/transcribe.js'

/**
 * Ponto de entrada de toda mensagem recebida.
 *
 * @param {{numero: string, texto?: string, audio?: {buffer: Buffer, mimeType: string}}} msg
 * @param {(numero: string, texto: string) => Promise<void>} enviarMensagem
 * @param {object} deps dependências injetáveis (transcrever, chamar, extrair) — para teste
 */
export async function tratarMensagemRecebida(msg, enviarMensagem, deps = {}) {
  const transcrever = deps.transcrever ?? transcreverAudio
  const chamar = deps.chamar ?? chamarLLM
  const extrair = deps.extrair ?? extrairRemedios
  const db = deps.db

  let texto = msg.texto ?? ''

  // Áudio é transcrito ANTES de qualquer roteamento.
  if (msg.audio?.buffer?.length) {
    const r = await transcrever(msg.audio.buffer, msg.audio.mimeType)
    if (!r.ok) {
      console.error('[handler] transcrição falhou:', r.erro)
      await enviarMensagem(
        msg.numero,
        'Não consegui ouvir esse áudio. Pode escrever, se der?',
      )
      return { acao: 'transcricao_falhou' }
    }
    texto = r.texto
  }

  const usuario = repo.findByWhatsapp(msg.numero, db)

  // Rede de segurança: mensagem de quem nunca foi convidado.
  // O fluxo PENSADO é sempre o convite proativo (src/admin/convidarPiloto.js);
  // este ramo existe só para mensagem fora de fluxo.
  if (!usuario || usuario.anamnese_estado === null) {
    const criado = repo.findOrCreate(msg.numero, db)
    await enviarMensagem(msg.numero, TEXTO_CONSENTIMENTO)
    return { acao: 'consentimento_enviado', usuarioId: criado.usuario_id }
  }

  if (usuario.anamnese_estado < ESTADOS.CONCLUIDO) {
    return processarPassoAnamnese(usuario, texto, enviarMensagem, { extrair, db })
  }

  return processarMensagemNormal(usuario, texto, enviarMensagem, { chamar, db })
}

async function processarPassoAnamnese(usuario, texto, enviarMensagem, { extrair, db }) {
  registrar({ usuarioId: usuario.usuario_id, tipo: TIPOS_INTERACAO.ANAMNESE, texto }, db)

  const plano = await processarResposta(usuario, texto, { extrairRemedios: extrair })
  const { mensagens } = aplicarPlano(usuario.usuario_id, plano, db)

  for (const m of mensagens) await enviarMensagem(usuario.numero_whatsapp, m)

  return {
    acao: 'anamnese',
    estadoAnterior: usuario.anamnese_estado,
    estadoAtual: repo.findById(usuario.usuario_id, db).anamnese_estado,
    enviadas: mensagens.length,
  }
}

async function processarMensagemNormal(usuario, texto, enviarMensagem, { chamar, db }) {
  const ultimoGatilho = ultimoGatilhoDisparado(usuario.usuario_id, db)
  const classe = classificarMensagem(new Date(), ultimoGatilho, config.respostaGatilhoJanelaMin)
  const gatilhoTipo = ultimoGatilho?.gatilho_relacionado ?? null

  registrar(
    {
      usuarioId: usuario.usuario_id,
      tipo: classe,
      texto,
      gatilhoRelacionado: classe === TIPOS_INTERACAO.RESPOSTA_GATILHO ? gatilhoTipo : null,
    },
    db,
  )

  if (classe === TIPOS_INTERACAO.DESPEJO_ESPONTANEO) {
    repo.incrementarDespejoEspontaneo(usuario.usuario_id, new Date(), db)
  } else if (gatilhoTipo) {
    // Respondeu: o contador de silêncio daquele tipo volta a zero.
    repo.zerarSilencio(usuario.usuario_id, gatilhoTipo, db)
  }

  const systemPrompt = montarSystemPrompt(usuario, repo.listarRemedios(usuario.usuario_id, db))

  let resposta
  try {
    resposta = await chamar({ systemPrompt, mensagens: [{ role: 'user', content: texto }] })
  } catch (e) {
    console.error('[handler] falha na chamada de LLM:', e?.message ?? e)
    return { acao: classe, respondeu: false }
  }

  if (resposta) await enviarMensagem(usuario.numero_whatsapp, resposta)

  return { acao: classe, respondeu: Boolean(resposta) }
}
