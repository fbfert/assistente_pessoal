import * as repo from '../db/userRepo.js'
import { registrar } from '../db/interactionLog.js'
import { CANAIS } from '../constants.js'
import { montarResumoAnamnese } from './stateMachine.js'

/**
 * Aplica no banco o plano de ação devolvido pela máquina de estados.
 *
 * A máquina é pura de propósito (ver stateMachine.js); toda a escrita acontece
 * aqui, em um lugar só. As ações são aplicadas na ordem em que vieram — a
 * ordem importa: `montarResumo` precisa ler o usuário já com a personalidade
 * gravada.
 *
 * `canal` é aditivo e tem padrão: quem não informa está no fluxo do WhatsApp,
 * que era o único canal quando esta função foi escrita.
 *
 * @returns {{mensagens: string[]}} mensagens a enviar, já resolvidas
 */
export function aplicarPlano(usuarioId, plano, db, canal = CANAIS.WHATSAPP) {
  const mensagens = [...plano.mensagens]

  for (const acao of plano.acoes) {
    switch (acao.tipo) {
      case 'salvarCampo':
        repo.salvarCampoAnamnese(usuarioId, acao.campo, acao.valor, db)
        break

      case 'setEstado':
        repo.setAnamneseEstado(usuarioId, acao.estado, db)
        break

      case 'marcarExemploPedido':
        repo.marcarExemploPedido(usuarioId, db)
        break

      case 'registrarConsentimento':
        repo.registrarConsentimento(usuarioId, acao.versao, db)
        break

      case 'adicionarRemedio':
        repo.adicionarRemedio(usuarioId, acao.nome, acao.horario, db)
        break

      case 'setPersonalidade':
        repo.setPersonalidade(usuarioId, acao.valor, db)
        break

      case 'registrarInteracao':
        registrar(
          { usuarioId, tipo: acao.tipoInteracao, texto: acao.texto, canal },
          db,
        )
        break

      case 'montarResumo':
        mensagens.push(
          montarResumoAnamnese(repo.findById(usuarioId, db), repo.listarRemedios(usuarioId, db)),
        )
        break

      case 'concluirAnamnese':
        repo.concluirAnamnese(usuarioId, db)
        break

      default:
        throw new Error(`Ação de anamnese desconhecida: ${acao.tipo}`)
    }
  }

  return { mensagens }
}
