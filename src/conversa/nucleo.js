import { config } from '../config.js'
import {
  CANAIS,
  RESPOSTA_SEGURA_MEDICACAO,
  SEM_INFORMACAO,
  TIPOS_INTERACAO,
} from '../constants.js'
import { instruiSobreMedicacao } from './seguranca.js'
import * as repo from '../db/userRepo.js'
import { registrar, ultimoGatilhoDisparado } from '../db/interactionLog.js'
import { ESTADOS } from '../anamnese/questions.js'
import { processarResposta } from '../anamnese/stateMachine.js'
import { aplicarPlano } from '../anamnese/aplicarPlano.js'
import { extrairRemedios, temIndicioDeRemedio } from '../anamnese/extrairRemedios.js'
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

  return conversaLivre(usuario, texto, canal, responder, { chamar, extrair, db })
}

/**
 * Envia e REGISTRA — nesta ordem.
 *
 * Registrar antes produziria histórico de mensagem que nunca chegou; quando o
 * envio falha, a ausência da linha é a informação correta. Sem isto, metade da
 * conversa não existia em lugar nenhum.
 */
async function enviar(usuarioId, texto, canal, responder, db) {
  await responder(texto)
  registrar({ usuarioId, tipo: TIPOS_INTERACAO.MENSAGEM_ENVIADA, texto, canal }, db)
}

async function passoDeAnamnese(usuario, texto, canal, responder, { extrair, db }) {
  registrar({ usuarioId: usuario.usuario_id, tipo: TIPOS_INTERACAO.ANAMNESE, texto, canal }, db)

  const plano = await processarResposta(usuario, texto, { extrairRemedios: extrair })
  const { mensagens } = aplicarPlano(usuario.usuario_id, plano, db, canal)

  for (const m of mensagens) await enviar(usuario.usuario_id, m, canal, responder, db)

  return {
    acao: 'anamnese',
    estadoAnterior: usuario.anamnese_estado,
    estadoAtual: repo.findById(usuario.usuario_id, db).anamnese_estado,
    enviadas: mensagens.length,
  }
}

async function conversaLivre(usuario, texto, canal, responder, { chamar, extrair, db }) {
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

  const remedios = repo.listarRemedios(usuario.usuario_id, db)
  const systemPrompt = montarSystemPrompt(usuario, remedios)

  // As duas chamadas de LLM saem JUNTAS. A extração só acontece quando o texto
  // tem indício de medicação, então na maioria das mensagens a segunda promessa
  // resolve na hora, sem custo nenhum.
  const [respostaOuErro, gravados] = await Promise.all([
    chamar({ systemPrompt, mensagens: [{ role: 'user', content: texto }] }).catch((e) => {
      console.error('[conversa] falha na chamada de LLM:', e?.message ?? e)
      return null
    }),
    gravarRemedioDitoNaConversa(usuario, texto, remedios, { extrair, db }),
  ])

  const resposta = respostaOuErro

  // REDE DE SEGURANÇA, antes de qualquer envio: o assistente não instrui sobre
  // medicação. Vale para os dois canais porque mora aqui, e não nos adaptadores.
  //
  // Só a saída do MODELO é varrida. A confirmação de remédio, logo abaixo, é
  // texto constante do código — varrê-la bloquearia a própria mensagem que
  // existe para dizer o que foi gravado.
  if (resposta && instruiSobreMedicacao(resposta, remedios).bloqueia) {
    registrar(
      {
        usuarioId: usuario.usuario_id,
        tipo: TIPOS_INTERACAO.RESPOSTA_BLOQUEADA_SEGURANCA,
        // O texto recusado é GUARDADO: sem ele não há como auditar quantas vezes
        // o modelo tentou.
        texto: resposta,
        canal,
      },
      db,
    )
    console.warn(`[conversa] resposta bloqueada por instrução de medicação (usuário ${usuario.usuario_id})`)

    await enviar(usuario.usuario_id, RESPOSTA_SEGURA_MEDICACAO, canal, responder, db)

    return { acao: classe, respondeu: true, bloqueada: true }
  }

  if (resposta) await enviar(usuario.usuario_id, resposta, canal, responder, db)

  // A confirmação é texto DETERMINÍSTICO, e não instrução ao modelo: a pessoa
  // precisa saber o que foi gravado mesmo que o modelo tenha respondido outra
  // coisa — ou não tenha respondido nada.
  if (gravados.length) {
    await enviar(usuario.usuario_id, textoDeConfirmacao(gravados), canal, responder, db)
  }

  return { acao: classe, respondeu: Boolean(resposta), remediosGravados: gravados.length }
}

/**
 * Remédio dito na conversa livre.
 *
 * SÓ grava item que vier com horário: sem horário não existe gatilho, então
 * gravar não mudaria nada e ainda criaria cadastro a partir de uma menção de
 * passagem. Nome sem horário é descartado em silêncio — a pessoa não pediu nada.
 *
 * Falha aqui NUNCA impede a resposta: devolve lista vazia e a conversa segue.
 *
 * @returns {Promise<Array<{nome: string, horario: string, acao: string}>>}
 */
async function gravarRemedioDitoNaConversa(usuario, texto, remedios, { extrair, db }) {
  if (!temIndicioDeRemedio(texto, remedios)) return []

  let extraidos
  try {
    extraidos = await extrair(texto)
  } catch (e) {
    console.error('[conversa] falha ao extrair remédio:', e?.message ?? e)
    return []
  }

  const gravados = []
  for (const r of extraidos ?? []) {
    const nome = String(r?.nome ?? '').trim()
    const horario = String(r?.horario ?? '').trim()
    if (!nome || nome === SEM_INFORMACAO) continue
    if (!horario || horario === SEM_INFORMACAO) continue

    try {
      const { acao } = repo.registrarHorarioDeRemedio(usuario.usuario_id, nome, horario, db)
      gravados.push({ nome, horario, acao })
    } catch (e) {
      console.error('[conversa] falha ao gravar remédio:', e?.message ?? e)
    }
  }

  return gravados
}

function textoDeConfirmacao(gravados) {
  const linhas = gravados.map((g) => `- ${g.nome} às ${g.horario}`).join('\n')
  const lembrete = gravados.length === 1 ? 'esse horário' : 'esses horários'

  return `Anotei aqui:\n${linhas}\n\nVou te lembrar ${lembrete}. Se algum estiver errado, me diz.`
}
