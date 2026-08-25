import { Router } from 'express'
import * as repo from '../../db/userRepo.js'
import { registrar } from '../../db/interactionLog.js'
import { convidarPiloto } from '../../admin/convidarPiloto.js'
import { pagina, escapar, rotuloGatilho } from '../html.js'
import { SEM_INFORMACAO, TIPOS_INTERACAO } from '../../constants.js'
import { buscarPorId } from '../../db/adminRepo.js'
import { PERSONALIDADES } from '../../llm/prompts.js'

export const rotasAcoes = Router()

/**
 * Auditoria: toda rota de escrita grava UMA linha `acao_admin`.
 *
 * Mesmo `historico_interacoes` append-only do resto do projeto, sem tabela
 * paralela — qualquer edição manual sobre dado de saúde fica no mesmo lugar que
 * qualquer outra interação daquela pessoa. Texto livre, como o resto do
 * histórico: é lido por gente, não por máquina.
 */
function auditar(req, usuarioId, texto) {
  const autor = req.adminId ? buscarPorId(req.adminId)?.email : null
  registrar({
    usuarioId,
    tipo: TIPOS_INTERACAO.ACAO_ADMIN,
    texto: `${texto} [por ${autor ?? 'admin não identificado'}]`,
  })
}

const voltar = (res, usuarioId) => res.redirect(302, `/usuarios/${usuarioId}`)

/**
 * O admin não envia mensagem: quem tem a sessão do WhatsApp é o processo do
 * bot, noutro container. O convite grava o usuário e registra a intenção; a
 * entrega efetiva sai pelo CLI do bot.
 */
const naoEnviaDaqui = async () => {}

// --- Convite ------------------------------------------------------------------

rotasAcoes.post('/convidar', async (req, res) => {
  const numero = String(req.body?.numero ?? '').trim()

  if (!/^\+?\d{10,15}$/.test(numero.replace(/[\s()-]/g, ''))) {
    return res.status(400).type('html').send(
      pagina('Número inválido', `<h1>Número inválido</h1>
        <p>“${escapar(numero)}” não parece um número de WhatsApp. Use <code>+5511999999999</code>.</p>
        <p><a href="/">voltar</a></p>`),
    )
  }

  const existente = repo.findByWhatsapp(numero)
  if (existente && !(existente.anamnese_estado === 0 && !existente.consentimento_aceito)) {
    return res.status(409).type('html').send(
      pagina('Já existe', `<h1>Esse número já está no piloto</h1>
        <p>Convidar de novo resetaria a anamnese para o estado 0 e apagaria o progresso.
        Para isso existe a ação explícita de reiniciar, na página do participante.</p>
        <p><a href="/usuarios/${existente.usuario_id}">ver participante</a> · <a href="/">painel</a></p>`),
    )
  }

  const usuario = await convidarPiloto(numero, naoEnviaDaqui)
  auditar(req, usuario.usuario_id, `participante ${numero} convidado via admin`)
  voltar(res, usuario.usuario_id)
})

rotasAcoes.post('/usuarios/:id/reenviar-convite', async (req, res) => {
  const usuario = repo.findById(req.params.id)
  if (!usuario) return res.status(404).send('não encontrado')

  // Guarda dura: `convidarPiloto` reseta o estado incondicionalmente.
  if (!(usuario.anamnese_estado === 0 && !usuario.consentimento_aceito)) {
    return res.status(409).type('html').send(
      pagina('Não permitido', `<h1>Reenvio bloqueado</h1>
        <p>Este participante tem progresso de anamnese. O convite resetaria tudo para o estado 0.
        Use “Reiniciar anamnese do zero” se for isso mesmo que você quer.</p>
        <p><a href="/usuarios/${usuario.usuario_id}">voltar</a></p>`),
    )
  }

  await convidarPiloto(usuario.numero_whatsapp, naoEnviaDaqui)
  auditar(req, usuario.usuario_id, 'convite reenviado via admin')
  voltar(res, usuario.usuario_id)
})

// --- Campo de anamnese ----------------------------------------------------------

rotasAcoes.post('/usuarios/:id/campo', (req, res) => {
  const usuario = repo.findById(req.params.id)
  if (!usuario) return res.status(404).send('não encontrado')

  const campo = String(req.body?.campo ?? '')
  const valor = String(req.body?.valor ?? '')
  const anterior = usuario[campo]

  try {
    // A validação da whitelist é da própria função — não reimplementada aqui.
    repo.salvarCampoAnamnese(usuario.usuario_id, campo, valor)
  } catch (e) {
    return res.status(400).type('html').send(
      pagina('Campo inválido', `<h1>Campo inválido</h1><p>${escapar(e.message)}</p>
        <p><a href="/usuarios/${usuario.usuario_id}">voltar</a></p>`),
    )
  }

  auditar(req, 
    usuario.usuario_id,
    `campo ${campo} alterado de "${anterior ?? SEM_INFORMACAO}" para "${valor}" via admin`,
  )
  voltar(res, usuario.usuario_id)
})

// --- Personalidade ----------------------------------------------------------------

rotasAcoes.post('/usuarios/:id/personalidade', (req, res) => {
  const usuario = repo.findById(req.params.id)
  if (!usuario) return res.status(404).send('não encontrado')

  const escolhida = String(req.body?.personalidade ?? '')

  // Valida contra a lista canônica ANTES do banco: o CHECK do schema é a última
  // linha de defesa, não a primeira. Recusar aqui devolve mensagem legível em
  // vez de erro de constraint.
  if (!PERSONALIDADES.some((p) => p.valor === escolhida)) {
    return res.status(400).type('html').send(
      pagina('Personalidade inválida', `<h1>Personalidade inválida</h1>
        <p>“${escapar(escolhida)}” não é uma das três opções.</p>
        <p><a href="/usuarios/${usuario.usuario_id}">voltar</a></p>`),
    )
  }

  const anterior = usuario.personalidade
  if (escolhida === anterior) return voltar(res, usuario.usuario_id)

  repo.setPersonalidade(usuario.usuario_id, escolhida)
  auditar(
    req,
    usuario.usuario_id,
    `personalidade alterada de "${anterior ?? SEM_INFORMACAO}" para "${escolhida}" via admin`,
  )
  voltar(res, usuario.usuario_id)
})

// --- Remédio --------------------------------------------------------------------

rotasAcoes.post('/usuarios/:id/remedio/:remedioId', (req, res) => {
  const anterior = repo.buscarRemedio(req.params.remedioId)
  if (!anterior) return res.status(404).send('remédio não encontrado')

  // Regra 1b: vazio vira o sentinela, nunca chute nem string vazia.
  const atualizado = repo.atualizarRemedio(
    anterior.remedio_id,
    req.body?.nome,
    req.body?.horario,
  )

  auditar(req, 
    anterior.usuario_id,
    `remédio "${anterior.nome}" (${anterior.horario}) alterado para ` +
      `"${atualizado.nome}" (${atualizado.horario}) via admin`,
  )
  voltar(res, anterior.usuario_id)
})

rotasAcoes.get('/usuarios/:id/remedio/:remedioId/remover', (req, res) => {
  const remedio = repo.buscarRemedio(req.params.remedioId)
  if (!remedio) return res.status(404).send('remédio não encontrado')

  res.type('html').send(
    confirmacao({
      titulo: 'Remover remédio',
      corpo: `<p>Remover <strong>${escapar(remedio.nome)}</strong> às
              <strong>${escapar(remedio.horario)}</strong>?</p>
              <p>O gatilho correspondente também deixa de existir.</p>`,
      acao: `/usuarios/${remedio.usuario_id}/remedio/${remedio.remedio_id}/remover`,
      botao: 'Remover',
      voltarPara: `/usuarios/${remedio.usuario_id}`,
    }),
  )
})

rotasAcoes.post('/usuarios/:id/remedio/:remedioId/remover', (req, res) => {
  const remedio = repo.buscarRemedio(req.params.remedioId)
  if (!remedio) return res.status(404).send('remédio não encontrado')

  repo.removerRemedio(remedio.remedio_id)
  auditar(req, remedio.usuario_id, `remédio "${remedio.nome}" (${remedio.horario}) removido via admin`)
  voltar(res, remedio.usuario_id)
})

// --- Gatilho ---------------------------------------------------------------------

rotasAcoes.post('/usuarios/:id/gatilho/:gatilhoId', (req, res) => {
  const anterior = repo.buscarGatilho(req.params.gatilhoId)
  if (!anterior) return res.status(404).send('gatilho não encontrado')

  const ativo = req.body?.ativo === '1'
  const horario = String(req.body?.horario ?? '').trim() || anterior.horario

  if (!/^\d{2}:\d{2}$/.test(horario)) {
    return res.status(400).type('html').send(
      pagina('Horário inválido', `<h1>Horário inválido</h1>
        <p>Use o formato <code>HH:MM</code>.</p>
        <p><a href="/usuarios/${anterior.usuario_id}">voltar</a></p>`),
    )
  }

  repo.atualizarGatilho(anterior.gatilho_id, { horario, ativo })

  const mudancas = []
  if (horario !== anterior.horario) mudancas.push(`horário ${anterior.horario} → ${horario}`)
  if (ativo !== Boolean(anterior.ativo)) mudancas.push(ativo ? 'ativado' : 'desativado')

  auditar(req, 
    anterior.usuario_id,
    `gatilho ${rotuloGatilho(anterior.tipo)} (${anterior.horario}) ${
      mudancas.join(', ') || 'salvo sem alteração'
    } via admin`,
  )
  voltar(res, anterior.usuario_id)
})

// --- Contador de silêncio ---------------------------------------------------------

rotasAcoes.post('/usuarios/:id/silencio/:tipo', (req, res) => {
  const usuario = repo.findById(req.params.id)
  if (!usuario) return res.status(404).send('não encontrado')

  const tipo = req.params.tipo
  const antes = repo.getSilencioConsecutivo(usuario.usuario_id, tipo)
  repo.zerarSilencio(usuario.usuario_id, tipo)

  auditar(req, 
    usuario.usuario_id,
    `contador de silêncio de ${rotuloGatilho(tipo)} zerado (estava em ${antes}) via admin`,
  )
  voltar(res, usuario.usuario_id)
})

// --- Pausa -------------------------------------------------------------------------

rotasAcoes.post('/usuarios/:id/pausa', (req, res) => {
  const usuario = repo.findById(req.params.id)
  if (!usuario) return res.status(404).send('não encontrado')

  const pausar = req.body?.pausado === '1'
  repo.setPausado(usuario.usuario_id, pausar)

  auditar(req, usuario.usuario_id, `participante ${pausar ? 'pausado' : 'despausado'} via admin`)
  voltar(res, usuario.usuario_id)
})

// --- Reiniciar anamnese (destrutiva) -------------------------------------------------

rotasAcoes.get('/usuarios/:id/reiniciar', (req, res) => {
  const usuario = repo.findById(req.params.id)
  if (!usuario) return res.status(404).send('não encontrado')

  res.type('html').send(
    confirmacao({
      titulo: 'Reiniciar anamnese',
      corpo: `<div class="aviso">Ação destrutiva.</div>
        <p>Isto apaga, de <strong>${escapar(usuario.nome) || escapar(usuario.numero_whatsapp)}</strong>:</p>
        <ul>
          <li>todas as respostas da anamnese e a personalidade escolhida</li>
          <li>todos os remédios cadastrados</li>
          <li>todos os gatilhos configurados</li>
          <li>os contadores de silêncio</li>
        </ul>
        <p>O consentimento e o histórico de interações <strong>permanecem</strong> — o histórico é
        append-only e é o que prova o que aconteceu antes.</p>
        <p>A anamnese volta ao estado 0 e a pessoa responde tudo de novo.</p>`,
      acao: `/usuarios/${usuario.usuario_id}/reiniciar`,
      botao: 'Reiniciar do zero',
      voltarPara: `/usuarios/${usuario.usuario_id}`,
    }),
  )
})

rotasAcoes.post('/usuarios/:id/reiniciar', (req, res) => {
  const usuario = repo.findById(req.params.id)
  if (!usuario) return res.status(404).send('não encontrado')

  repo.reiniciarAnamnese(usuario.usuario_id)
  auditar(req, usuario.usuario_id, 'anamnese reiniciada do zero via admin')
  voltar(res, usuario.usuario_id)
})

// --- Anonimizar (irreversível) --------------------------------------------------------

rotasAcoes.get('/usuarios/:id/anonimizar', (req, res) => {
  const usuario = repo.findById(req.params.id)
  if (!usuario) return res.status(404).send('não encontrado')

  res.type('html').send(
    confirmacao({
      titulo: 'Anonimizar participante',
      corpo: `<div class="aviso">Ação irreversível. Não existe desfazer.</div>
        <p>Usada quando a pessoa pede para sair do piloto.</p>
        <p><strong>Fica redigido:</strong> número de WhatsApp, todos os campos da anamnese,
        nome e horário dos remédios, e o texto de todas as interações — inclusive as conversas,
        que costumam conter nome e detalhes de saúde escritos pela própria pessoa.</p>
        <p><strong>Permanece:</strong> o registro de que houve consentimento (com data e versão),
        e o tipo e o horário de cada interação. É o rastro de auditoria — apagar a pessoa de vez
        levaria junto a prova de que ela consentiu.</p>
        <p>O participante também é pausado e seus gatilhos desativados.</p>`,
      acao: `/usuarios/${usuario.usuario_id}/anonimizar`,
      botao: 'Anonimizar em definitivo',
      voltarPara: `/usuarios/${usuario.usuario_id}`,
    }),
  )
})

rotasAcoes.post('/usuarios/:id/anonimizar', (req, res) => {
  const usuario = repo.findById(req.params.id)
  if (!usuario) return res.status(404).send('não encontrado')

  // A auditoria vem ANTES: a anonimização redige o texto de todas as
  // interações existentes, e uma linha gravada depois preserva o motivo.
  repo.anonimizarParticipante(usuario.usuario_id)
  auditar(req, usuario.usuario_id, 'participante anonimizado via admin — pedido de saída do piloto')

  res.redirect(302, '/')
})

// --- Tela intermediária ------------------------------------------------------------------

/**
 * Segunda etapa de confirmação.
 *
 * O projeto não usa JavaScript de cliente, então não há `confirm()`. Esta
 * página em GET cumpre o papel: descreve o efeito, não altera nada, e
 * recarregá-la é inofensivo.
 */
function confirmacao({ titulo, corpo, acao, botao, voltarPara }) {
  return pagina(
    titulo,
    `<h1>${escapar(titulo)}</h1>
     ${corpo}
     <form method="post" action="${acao}">
       <p>
         <button type="submit" class="perigo">${escapar(botao)}</button>
         <a href="${voltarPara}">cancelar</a>
       </p>
     </form>`,
  )
}
