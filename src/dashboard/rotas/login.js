import { Router } from 'express'
import { pagina, escapar } from '../html.js'
import * as admins from '../../db/adminRepo.js'
import {
  criarSessao,
  encerrarSessao,
  definirCookie,
  limparCookie,
  lerCookie,
  sessaoValida,
  registrarFalhaDeLogin,
} from '../auth.js'

export const rotasLogin = Router()

function telaLogin({ erro = null, email = '' } = {}) {
  return pagina(
    'Entrar',
    `<h1>TARS piloto</h1>
     <p class="nota">Backend administrativo.</p>
     ${erro ? `<div class="aviso">${escapar(erro)}</div>` : ''}
     <form method="post" action="/login">
       <label for="email">E-mail</label>
       <input type="text" id="email" name="email" value="${escapar(email)}"
              autocomplete="username" autofocus required>

       <label for="senha">Senha</label>
       <input type="password" id="senha" name="senha" autocomplete="current-password" required>

       <p><button type="submit">Entrar</button></p>
     </form>`,
    { nav: false },
  )
}

rotasLogin.get('/login', (req, res) => {
  if (sessaoValida(lerCookie(req))) return res.redirect(302, '/')
  res.type('html').send(telaLogin())
})

rotasLogin.post('/login', async (req, res) => {
  const email = String(req.body?.email ?? '').trim()
  const conta = await admins.autenticar(email, req.body?.senha)

  if (!conta) {
    registrarFalhaDeLogin(req, email)
    // Mensagem única: não distingue "e-mail não existe" de "senha errada" nem
    // de "conta desativada". O tempo de resposta também não distingue —
    // ver `queimarTempo` em senha.js.
    return res
      .status(401)
      .type('html')
      .send(telaLogin({ erro: 'E-mail ou senha incorretos.', email }))
  }

  definirCookie(req, res, criarSessao(conta.admin_id))
  res.redirect(302, '/')
})

rotasLogin.post('/logout', (req, res) => {
  encerrarSessao(lerCookie(req))
  limparCookie(res)
  res.redirect(302, '/login')
})
