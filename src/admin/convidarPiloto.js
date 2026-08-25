import * as repo from '../db/userRepo.js'
import { registrar } from '../db/interactionLog.js'
import { TIPOS_INTERACAO } from '../constants.js'
import { ESTADOS, TEXTO_CONSENTIMENTO } from '../anamnese/questions.js'

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
 * @param {string} numeroWhatsapp
 * @param {(numero: string, texto: string) => Promise<void>} enviarMensagem
 */
export async function convidarPiloto(numeroWhatsapp, enviarMensagem, db) {
  const usuario = repo.findOrCreate(numeroWhatsapp, db)

  repo.setAnamneseEstado(usuario.usuario_id, ESTADOS.CONSENTIMENTO, db)

  await enviarMensagem(numeroWhatsapp, TEXTO_CONSENTIMENTO)

  registrar(
    {
      usuarioId: usuario.usuario_id,
      tipo: TIPOS_INTERACAO.ANAMNESE,
      texto: 'convite enviado; texto de consentimento entregue',
    },
    db,
  )

  return repo.findById(usuario.usuario_id, db)
}
