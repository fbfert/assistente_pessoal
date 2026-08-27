import { config } from '../config.js'
import {
  CANAIS,
  RESPOSTA_SEGURA_MEDICACAO,
  SEM_INFORMACAO,
  TIPOS_INTERACAO,
} from '../constants.js'
import { instruiSobreMedicacao } from './seguranca.js'
import * as repo from '../db/userRepo.js'
import { CAMPOS_APRENDIVEIS } from '../db/userRepo.js'
import { registrar, ultimoGatilhoDisparado } from '../db/interactionLog.js'
import { ESTADOS } from '../anamnese/questions.js'
import { processarResposta } from '../anamnese/stateMachine.js'
import { aplicarPlano } from '../anamnese/aplicarPlano.js'
import { extrairRemedios, temIndicioDeRemedio } from '../anamnese/extrairRemedios.js'
import { extrairAprendizado } from '../anamnese/aprenderPerfil.js'
import * as notasRepo from '../db/notasRepo.js'
import { classificarMensagem } from '../classify/heuristic.js'
import { identificarTema } from '../conhecimento/classificarTema.js'
import { taxonomia } from '../conhecimento/temasRepo.js'
import { escolherParaTema } from '../conhecimento/tecnicasRepo.js'
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
  const aprender = deps.aprender ?? extrairAprendizado
  const buscarTecnica = deps.buscarTecnica ?? buscarTecnicaDoBanco
  const db = deps.db

  if (usuario.anamnese_estado < ESTADOS.CONCLUIDO) {
    return passoDeAnamnese(usuario, texto, canal, responder, { extrair, db })
  }

  return conversaLivre(usuario, texto, canal, responder, {
    chamar,
    extrair,
    aprender,
    buscarTecnica,
    db,
  })
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

async function conversaLivre(
  usuario,
  texto,
  canal,
  responder,
  { chamar, extrair, aprender, buscarTecnica, db },
) {
  const ultimoGatilho = ultimoGatilhoDisparado(usuario.usuario_id, db)
  const classe = classificarMensagem(new Date(), ultimoGatilho, config.respostaGatilhoJanelaMin)
  const gatilhoTipo = ultimoGatilho?.gatilho_relacionado ?? null

  // A linha da mensagem recebida é o que a nota aponta como origem — guardar a
  // referência evita copiar a mensagem, que pode ter outro dado sensível sem
  // relação com o que foi aprendido.
  const { interacao_id: interacaoId } = registrar(
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
  const notas = notasRepo.notasAtivasPorCampo(usuario.usuario_id, db)

  // A técnica é buscada ANTES da chamada, e não junto com as outras duas: o
  // resultado dela entra no prompt DESTA chamada, então não há o que
  // paralelizar. É consulta local a SQLite com índice — microssegundos, não rede.
  const tecnica = escolherTecnica(usuario, texto, canal, { buscarTecnica, db })

  const systemPrompt = montarSystemPrompt(usuario, remedios, notas, tecnica)

  // As TRÊS chamadas saem JUNTAS. A resposta não espera nenhuma das outras duas:
  // reconhecer no mesmo turno exigiria série, dobrando o tempo até qualquer
  // reply — inclusive nas mensagens que não ensinam nada, que são a maioria.
  //
  // O aprendizado aparece a partir da mensagem SEGUINTE, pelo contexto
  // enriquecido. Este caminho não envia texto nenhum, então também não cruza a
  // verificação de segurança logo abaixo.
  const [respostaOuErro, gravados, aprendido] = await Promise.all([
    chamar({ systemPrompt, mensagens: [{ role: 'user', content: texto }] }).catch((e) => {
      console.error('[conversa] falha na chamada de LLM:', e?.message ?? e)
      return null
    }),
    gravarRemedioDitoNaConversa(usuario, texto, remedios, { extrair, db }),
    aprenderSobreOPerfil(usuario, texto, { canal, notas, aprender, interacaoId, db }),
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

  return {
    acao: classe,
    respondeu: Boolean(resposta),
    remediosGravados: gravados.length,
    aprendeu: Boolean(aprendido),
    tecnica: tecnica?.tecnica_id ?? null,
  }
}

/**
 * A técnica prática que entra no contexto desta resposta — no máximo UMA.
 *
 * Uma vira sugestão; duas viram cardápio, que é o oposto da regra de ouro do
 * input mínimo. Quem não consegue começar uma tarefa não vai escolher entre três
 * métodos de começar.
 *
 * Sem tema identificado, ou sem técnica publicada naquele tema, devolve null e a
 * conversa segue exatamente como antes desta mudança — inclusive sem mencionar a
 * lacuna para a pessoa. Enquanto ninguém tiver curado conteúdo, a base é inerte.
 *
 * Falha aqui NUNCA impede a resposta: uma sugestão que não veio é um detalhe;
 * uma pessoa sem resposta, não.
 */
function escolherTecnica(usuario, texto, canal, { buscarTecnica, db }) {
  try {
    const tecnica = buscarTecnica(texto, db)
    if (!tecnica) return null

    // O registro é da INJEÇÃO no contexto, não da entrega: o sistema sabe o que
    // ofereceu ao modelo e não tem como afirmar que ele usou. O texto diz isso
    // com todas as letras, para ninguém ler a linha como prova do contrário.
    registrar(
      {
        usuarioId: usuario.usuario_id,
        tipo: TIPOS_INTERACAO.TECNICA_SUGERIDA,
        texto: `oferecida ao modelo: "${tecnica.titulo}" (#${tecnica.tecnica_id}, ${tecnica.tema})`,
        canal,
      },
      db,
    )

    return tecnica
  } catch (e) {
    console.error('[conversa] falha ao buscar técnica:', e?.message ?? e)
    return null
  }
}

/** A busca de verdade. Injetável para que o teste do núcleo não abra SQLite. */
function buscarTecnicaDoBanco(texto, db) {
  const tema = identificarTema(texto, taxonomia(db))
  return tema ? escolherParaTema(tema, db) : null
}

/**
 * Aprendizado de perfil, em paralelo com a resposta.
 *
 * NÃO envia nada: o reconhecimento acontece pelo contexto enriquecido das
 * mensagens seguintes. Foi a decisão registrada — é a resposta rápida que segura
 * alguém com TDAH esperando, não o reconhecimento instantâneo.
 *
 * Falha vira "não aprendeu nada", sempre. Este caminho não pode, em nenhuma
 * circunstância, impedir a pessoa de receber a resposta dela.
 *
 * @returns {Promise<object|null>} a nota criada, ou null
 */
async function aprenderSobreOPerfil(usuario, texto, { canal, notas, aprender, interacaoId, db }) {
  try {
    const resultado = await aprender(texto, perfilConhecido(usuario, notas), {})
    if (!resultado?.aprendeu) return null

    const nota = notasRepo.criarNota(
      {
        usuarioId: usuario.usuario_id,
        campo: resultado.campo,
        texto: resultado.texto,
        interacaoId,
      },
      db,
    )

    // Auditoria com o CAMPO e o TEXTO da nota — nunca a mensagem de origem
    // inteira, que pode conter outro dado sensível sem relação com isto. A
    // rastreabilidade até a mensagem é a coluna `interacao_id`.
    registrar(
      {
        usuarioId: usuario.usuario_id,
        tipo: TIPOS_INTERACAO.APRENDIZADO_PERFIL,
        texto: `${resultado.campo}: "${resultado.texto}"`,
        canal,
      },
      db,
    )

    return nota
  } catch (e) {
    console.error('[conversa] falha no aprendizado de perfil:', e?.message ?? e)
    return null
  }
}

/** O que já se sabe, para o extrator não reaprender. */
function perfilConhecido(usuario, notas) {
  const linhas = []

  for (const campo of CAMPOS_APRENDIVEIS) {
    const original = usuario?.[campo]
    const doCampo = (notas?.[campo] ?? []).map((n) => n.texto)
    if (!original && !doCampo.length) continue

    linhas.push(`- ${campo}: ${[original, ...doCampo].filter(Boolean).join(' | ')}`)
  }

  return linhas.join('\n')
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
