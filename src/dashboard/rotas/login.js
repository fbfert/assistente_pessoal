import { Router } from 'express'
import { pagina, escapar } from '../html.js'
import {
  senhaConfere,
  criarSessao,
  encerrarSessao,
  definirCookie,
  limparCookie,
  lerCookie,
  sessaoValida,
  registrarFalhaDeLogin,
} from '../auth.js'

export const rotasLogin = Router()

function telaLogin(erro = null) {
  return pagina(
    'Entrar',
    `<h1>TARS piloto</h1>
     <p class="nota">Backend administrativo.</p>
     ${erro ? `<div class="aviso">${escapar(erro)}</div>` : ''}
     <form method="post" action="/login">
       <label for="senha">Senha</label>
       <input type="password" id="senha" name="senha" autofocus autocomplete="current-password" required>
       <p><button type="submit">Entrar</button></p>
     </form>`,
    { nav: false },
  )
}

rotasLogin.get('/login', (req, res) => {
  if (sessaoValida(lerCookie(req))) return res.redirect(302, '/')
  res.type('html').send(telaLogin())
})

rotasLogin.post('/login', (req, res) => {
  if (!senhaConfere(req.body?.senha)) {
    registrarFalhaDeLogin(req)
    // Mensagem genérica: não distingue "senha errada" de qualquer outra coisa.
    return res.status(401).type('html').send(telaLogin('Senha incorreta.'))
  }

  definirCookie(req, res, criarSessao())
  res.redirect(302, '/')
})

rotasLogin.post('/logout', (req, res) => {
  encerrarSessao(lerCookie(req))
  limparCookie(res)
  res.redirect(302, '/login')
})
