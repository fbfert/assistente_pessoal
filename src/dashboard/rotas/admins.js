import { Router } from 'express'
import * as admins from '../../db/adminRepo.js'
import { registrarAcaoAdmin, listarAuditoriaAdmin, ACOES } from '../../db/auditoriaAdminRepo.js'
import { encerrarSessoesDe } from '../auth.js'
import { pagina, escapar } from '../html.js'

export const rotasAdmins = Router()

const EMAIL_VALIDO = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

rotasAdmins.get('/admins', (req, res) => {
  res.type('html').send(tela(req))
})

// --- Criar --------------------------------------------------------------------

rotasAdmins.post('/admins', async (req, res) => {
  const nome = String(req.body?.nome ?? '').trim()
  const email = String(req.body?.email ?? '').trim()

  if (!nome) return res.status(400).type('html').send(tela(req, { erro: 'Informe o nome.' }))
  if (!EMAIL_VALIDO.test(email)) {
    return res.status(400).type('html').send(tela(req, { erro: `"${email}" não é um e-mail válido.` }))
  }

  const r = await admins.criarComSenhaTemporaria({ nome, email })
  if (!r.ok) return res.status(409).type('html').send(tela(req, { erro: r.erro }))

  registrarAcaoAdmin({
    autorId: req.adminId,
    alvoId: r.conta.admin_id,
    acao: ACOES.CRIOU,
    // A senha gerada NÃO entra aqui.
    descricao: `conta criada para ${email}`,
  })

  res.type('html').send(
    tela(req, { senhaGerada: { email, senha: r.senhaTemporaria, acao: 'criada' } }),
  )
})

// --- Resetar senha ---------------------------------------------------------------

rotasAdmins.post('/admins/:id/resetar', async (req, res) => {
  const alvo = admins.buscarPorId(req.params.id)
  if (!alvo) return res.status(404).send('conta não encontrada')

  const r = await admins.resetarSenha(alvo.admin_id)
  if (!r.ok) return res.status(400).type('html').send(tela(req, { erro: r.erro }))

  // Se a senha foi resetada por suspeita de acesso indevido, deixar a sessão
  // antiga viva anularia o motivo.
  encerrarSessoesDe(alvo.admin_id)

  registrarAcaoAdmin({
    autorId: req.adminId,
    alvoId: alvo.admin_id,
    acao: ACOES.RESETOU_SENHA,
    descricao: `senha de ${alvo.email} resetada`,
  })

  res.type('html').send(
    tela(req, { senhaGerada: { email: alvo.email, senha: r.senhaTemporaria, acao: 'resetada' } }),
  )
})

// --- Desativar e reativar ---------------------------------------------------------

rotasAdmins.post('/admins/:id/desativar', (req, res) => {
  const alvo = admins.buscarPorId(req.params.id)
  if (!alvo) return res.status(404).send('conta não encontrada')

  // Guardas de SERVIDOR: esconder o botão não bastaria.
  const r = admins.desativarConta(alvo.admin_id, { porAdminId: req.adminId })
  if (!r.ok) return res.status(409).type('html').send(tela(req, { erro: r.erro }))

  encerrarSessoesDe(alvo.admin_id)
  registrarAcaoAdmin({
    autorId: req.adminId,
    alvoId: alvo.admin_id,
    acao: ACOES.DESATIVOU,
    descricao: `conta de ${alvo.email} desativada`,
  })

  res.redirect(302, '/admins')
})

rotasAdmins.post('/admins/:id/reativar', (req, res) => {
  const alvo = admins.buscarPorId(req.params.id)
  if (!alvo) return res.status(404).send('conta não encontrada')

  admins.reativarConta(alvo.admin_id)
  registrarAcaoAdmin({
    autorId: req.adminId,
    alvoId: alvo.admin_id,
    acao: ACOES.REATIVOU,
    descricao: `conta de ${alvo.email} reativada`,
  })

  res.redirect(302, '/admins')
})

// --- Tela ---------------------------------------------------------------------------

function tela(req, { erro = null, senhaGerada = null } = {}) {
  const contas = admins.listarContas()
  const ativos = admins.contarAtivos()

  const linhas = contas
    .map((c) => {
      const euMesmo = Number(c.admin_id) === Number(req.adminId)
      const ultimoAtivo = c.ativo && ativos <= 1

      const acoes = []
      if (c.ativo) {
        acoes.push(botao(`/admins/${c.admin_id}/resetar`, 'Resetar senha'))
        if (euMesmo) acoes.push('<span class="nota">é você</span>')
        else if (ultimoAtivo) acoes.push('<span class="nota">último ativo</span>')
        else acoes.push(botao(`/admins/${c.admin_id}/desativar`, 'Desativar', 'perigo'))
      } else {
        acoes.push(botao(`/admins/${c.admin_id}/reativar`, 'Reativar'))
      }

      return `<tr${c.ativo ? '' : ' class="inativo"'}>
        <td>${escapar(c.nome)}</td>
        <td>${escapar(c.email)}</td>
        <td>${c.ativo ? 'ativo' : '<strong>inativo</strong>'}${
          c.precisa_trocar_senha ? '<br><span class="nota">senha temporária pendente</span>' : ''
        }</td>
        <td class="num">${escapar(c.ultimo_login_em ?? 'nunca')}</td>
        <td>${acoes.join(' ')}</td>
      </tr>`
    })
    .join('')

  const auditoria = listarAuditoriaAdmin(30)
    .map(
      (a) => `<tr>
        <td class="num">${escapar(a.momento)}</td>
        <td>${escapar(a.autor_email ?? 'sistema')}</td>
        <td>${escapar(a.acao)}</td>
        <td>${escapar(a.descricao)}</td>
      </tr>`,
    )
    .join('')

  return pagina(
    'Administradores',
    `<h1>Administradores</h1>
<p class="nota">Todo administrador vê e edita tudo — não há hierarquia de permissão,
por decisão registrada. Conta se desativa, nunca se apaga: a auditoria precisa
continuar podendo nomear quem fez o quê.</p>

${erro ? `<div class="aviso">${escapar(erro)}</div>` : ''}
${senhaGerada ? blocoSenha(senhaGerada) : ''}

<table>
<thead><tr><th>Nome</th><th>E-mail</th><th>Situação</th><th>Último login</th><th></th></tr></thead>
<tbody>${linhas}</tbody>
</table>

<fieldset>
  <legend>Criar administrador</legend>
  <p class="nota">A senha é gerada pelo sistema e mostrada <strong>uma única vez</strong>.
  Quem entrar com ela é obrigado a trocá-la antes de fazer qualquer coisa.</p>
  <form method="post" action="/admins">
    <label for="nome">Nome</label>
    <input type="text" id="nome" name="nome" required>
    <label for="email">E-mail</label>
    <input type="text" id="email" name="email" placeholder="pessoa@xiax.com.br" required>
    <p><button type="submit">Criar</button></p>
  </form>
</fieldset>

<h2>Auditoria da equipe</h2>
<p class="nota">Ações sobre contas. Ações sobre participantes ficam na página de
cada participante — são linhas do tempo diferentes, de propósito.</p>
<table class="historico">
<thead><tr><th>Quando</th><th>Autor</th><th>Ação</th><th>O quê</th></tr></thead>
<tbody>${auditoria || '<tr><td colspan="4"><em>nada ainda</em></td></tr>'}</tbody>
</table>

<style>tr.inativo td { opacity: .55; }</style>`,
  )
}

function blocoSenha({ email, senha, acao }) {
  return `<div class="aviso">
  <p><strong>Senha ${acao} para ${escapar(email)}:</strong></p>
  <p><code style="font-size:1.3rem">${escapar(senha)}</code></p>
  <p>Anote agora e entregue à pessoa. <strong>Ela não será exibida de novo</strong> —
  não fica recuperável em lugar nenhum, nem no log de auditoria. Se perder, faça
  um novo reset.</p>
</div>`
}

const botao = (acao, rotulo, classe = '') =>
  `<form class="inline" method="post" action="${acao}">
     <button type="submit"${classe ? ` class="${classe}"` : ''}>${escapar(rotulo)}</button>
   </form>`
