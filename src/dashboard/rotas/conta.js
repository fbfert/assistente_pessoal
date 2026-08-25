import { Router } from 'express'
import * as admins from '../../db/adminRepo.js'
import { encerrarSessoesDe } from '../auth.js'
import { pagina, escapar } from '../html.js'

export const rotasConta = Router()

function tela(conta, { erro = null, ok = false } = {}) {
  return pagina(
    'Minha conta',
    `<h1>Minha conta</h1>
     <p class="nota">${escapar(conta.email)} · último login:
       ${escapar(conta.ultimo_login_em ?? 'este agora')}</p>

     ${erro ? `<div class="aviso">${escapar(erro)}</div>` : ''}
     ${ok ? '<p><strong>Senha trocada.</strong> As outras sessões foram encerradas.</p>' : ''}

     <fieldset>
       <legend>Trocar minha senha</legend>
       <form method="post" action="/conta/senha">
         <label for="atual">Senha atual</label>
         <input type="password" id="atual" name="atual" autocomplete="current-password" required>

         <label for="nova">Senha nova</label>
         <input type="password" id="nova" name="nova" autocomplete="new-password" required>

         <label for="confirmacao">Repita a senha nova</label>
         <input type="password" id="confirmacao" name="confirmacao" autocomplete="new-password" required>

         <p><button type="submit">Trocar senha</button></p>
       </form>
     </fieldset>

     <p class="nota">Trocar a senha aqui NÃO troca a senha do Apache
     (a que o navegador pede antes desta tela). São camadas independentes.</p>`,
  )
}

rotasConta.get('/conta', (req, res) => {
  const conta = admins.buscarPorId(req.adminId)
  if (!conta) return res.redirect(302, '/login')
  res.type('html').send(tela(conta))
})

rotasConta.post('/conta/senha', async (req, res) => {
  const conta = admins.buscarPorId(req.adminId)
  if (!conta) return res.redirect(302, '/login')

  const { atual, nova, confirmacao } = req.body ?? {}

  if (nova !== confirmacao) {
    return res.status(400).type('html').send(tela(conta, { erro: 'As duas senhas novas não batem.' }))
  }

  const r = await admins.trocarSenha(conta.admin_id, atual, nova)
  if (!r.ok) {
    return res.status(400).type('html').send(tela(conta, { erro: r.erro }))
  }

  // Trocar a senha derruba as outras sessões: se a troca foi por suspeita de
  // acesso indevido, deixar a sessão do invasor viva anularia o motivo.
  encerrarSessoesDe(conta.admin_id)

  res.type('html').send(tela(admins.buscarPorId(conta.admin_id), { ok: true }))
})
