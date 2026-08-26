import { config } from '../config.js'
import { CANAIS, TIPOS_INTERACAO } from '../constants.js'
import * as repo from '../db/userRepo.js'
import { registrar, ultimoGatilhoDisparado } from '../db/interactionLog.js'
import { ESTADOS } from '../anamnese/questions.js'
import { processarResposta } from '../anamnese/stateMachine.js'
import { aplicarPlano } from '../anamnese/aplicarPlano.js'
import { extrairRemedios } from '../anamnese/extrairRemedios.js'
import { classificarMensagem } from '../classify/heuristic.js'
import { montarSystemPrompt } from '../llm/prompts.js'
import { chamarLLM } from '../llm/router.js'

/**
 * NÚCLEO DE CONVERSA — o que todo canal compartilha.
 *
 * Recebe a pessoa JÁ IDENTIFICADA, o texto JÁ em forma de texto, o canal de
 * origem e uma função de envio. Não sabe quem o chamou.
 *
 * O que este módulo NÃO faz, e não deve passar a fazer:
 *
 * - identificar a pessoa (o adaptador resolve: número de WhatsApp, sessão web);
 * - transcrever áudio (é do transporte que tem áudio);
 * - filtrar mensagem de grupo ou eco do próprio bot (conceitos do WhatsApp);
 * - tratar remetente desconhecido (na web isso é sessão inválida, barrada antes).
 *
 * E o que nenhum adaptador pode fazer: decidir entre anamnese e conversa livre,
 * classificar a mensagem, montar prompt ou chamar o LLM. Enquanto essa decisão
 * viver dentro de um adaptador, acrescentar um canal significa copiá-la — e a
 * partir da primeira cópia as duas divergem em silêncio, cada correção valendo
 * só para um lado.
 *
 * Este arquivo NÃO importa nada de `src/whatsapp/` nem de `src/web/`. Existe
 * teste que falha se passar a importar.
 */

/**
 * @param {object} entrada
 * @param {object} entrada.usuario participante já identificado
 * @param {string} entrada.texto texto já resolvido (áudio já transcrito)
 * @param {string} entrada.canal um valor de CANAIS
 * @param {(texto: string) => Promise<void>} entrada.responder envio, sem endereço
 * @param {{chamar?: Function, extrair?: Function, db?: object}} deps injetáveis para teste
 */
export async function processarMensagem({ usuario, texto, canal, responder }, deps = {}) {
  if (!Object.values(CANAIS).includes(canal)) {
    // Falhar aqui e não no INSERT: o CHECK do banco é a última linha de defesa,
    // não a primeira, e o erro dele não diz quem chamou errado.
    throw new Error(`Canal desconhecido: "${canal}"`)
  }

  const chamar = deps.chamar ?? chamarLLM
  const extrair = deps.extrair ?? extrairRemedios
  const db = deps.db

  if (usuario.anamnese_estado < ESTADOS.CONCLUIDO) {
    return passoDeAnamnese(usuario, texto, canal, responder, { extrair, db })
  }

  return conversaLivre(usuario, texto, canal, responder, { chamar, db })
}

async function passoDeAnamnese(usuario, texto, canal, responder, { extrair, db }) {
  registrar({ usuarioId: usuario.usuario_id, tipo: TIPOS_INTERACAO.ANAMNESE, texto, canal }, db)

  const plano = await processarResposta(usuario, texto, { extrairRemedios: extrair })
  const { mensagens } = aplicarPlano(usuario.usuario_id, plano, db, canal)

  for (const m of mensagens) await responder(m)

  return {
    acao: 'anamnese',
    estadoAnterior: usuario.anamnese_estado,
    estadoAtual: repo.findById(usuario.usuario_id, db).anamnese_estado,
    enviadas: mensagens.length,
  }
}

async function conversaLivre(usuario, texto, canal, responder, { chamar, db }) {
  const ultimoGatilho = ultimoGatilhoDisparado(usuario.usuario_id, db)
  const classe = classificarMensagem(new Date(), ultimoGatilho, config.respostaGatilhoJanelaMin)
  const gatilhoTipo = ultimoGatilho?.gatilho_relacionado ?? null

  registrar(
    {
      usuarioId: usuario.usuario_id,
      tipo: classe,
      texto,
      gatilhoRelacionado: classe === TIPOS_INTERACAO.RESPOSTA_GATILHO ? gatilhoTipo : null,
      canal,
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
    console.error('[conversa] falha na chamada de LLM:', e?.message ?? e)
    return { acao: classe, respondeu: false }
  }

  if (resposta) await responder(resposta)

  return { acao: classe, respondeu: Boolean(resposta) }
}
