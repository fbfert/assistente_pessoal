import * as repo from '../db/userRepo.js'
import { registrar } from '../db/interactionLog.js'
import { TIPOS_INTERACAO } from '../constants.js'
import {
  ESTADOS,
  TEXTO_CONSENTIMENTO,
  MARCAS_INTERNAS_DE_ANAMNESE,
} from '../anamnese/questions.js'

/**
 * Convida uma pessoa para o piloto.
 *
 * ESTE é o caminho PRINCIPAL de onboarding, não um fallback: o bot fala
 * primeiro. A primeira mensagem que a pessoa mandar de volta já é a resposta
 * ao consentimento, processada normalmente pela máquina de estados.
 *
 * O onboarding reativo (esperar a pessoa escrever para só então mandar o
 * consentimento) foi descartado: obriga duas mensagens antes de qualquer coisa
 * acontecer e desalinha a contagem de passos da conversa com o que a máquina
 * de estados espera.
 *
 * Idempotente: convidar o mesmo número duas vezes reaproveita o usuário.
 *
 * A data de nascimento é o segundo fator da entrada pelo canal web. Chega aqui —
 * e não numa tela separada — para que exista UM ponto de pré-cadastro: um segundo
 * caminho, só para quem fosse usar a web, criaria um segundo conjunto de regras
 * sobre quando o estado 0 começa.
 *
 * O parâmetro é opcional na função e OBRIGATÓRIO em quem a chama (a tela do admin
 * e o CLI). Aqui ele é opcional porque participantes convidados antes desta
 * coluna existirem continuam válidos — só não entram pela web até o operador
 * preencher a data pela página de detalhe.
 *
 * @param {string} numeroWhatsapp
 * @param {(numero: string, texto: string) => Promise<void>} enviarMensagem
 * @param {object} [db]
 * @param {string} [dataNascimento] AAAA-MM-DD
 */
export async function convidarPiloto(numeroWhatsapp, enviarMensagem, db, dataNascimento = null) {
  const usuario = repo.findOrCreate(numeroWhatsapp, db)

  repo.setAnamneseEstado(usuario.usuario_id, ESTADOS.CONSENTIMENTO, db)

  if (dataNascimento) repo.salvarDataNascimento(usuario.usuario_id, dataNascimento, db)

  await enviarMensagem(numeroWhatsapp, TEXTO_CONSENTIMENTO)

  registrar(
    {
      usuarioId: usuario.usuario_id,
      tipo: TIPOS_INTERACAO.ANAMNESE,
      texto: MARCAS_INTERNAS_DE_ANAMNESE.CONVITE_ENVIADO,
    },
    db,
  )

  return repo.findById(usuario.usuario_id, db)
}
