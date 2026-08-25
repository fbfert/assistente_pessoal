import express from 'express'
import { pathToFileURL } from 'node:url'
import { config } from '../config.js'
import { getDb } from '../db/db.js'
import { exigirSenhaConfigurada, exigirSessao } from './auth.js'
import { pagina, escapar } from './html.js'
import { rotasLogin } from './rotas/login.js'
import { rotasPainel, renderizar } from './rotas/painel.js'
import { rotasUsuario, renderizarDetalhe } from './rotas/usuario.js'
import { rotasAcoes } from './rotas/acoes.js'
import { rotasConexao, renderizarConexao } from './rotas/conexao.js'

/**
 * Backend administrativo do piloto.
 *
 * Mesmo processo, mesma porta e mesmo bind do dashboard somente-leitura que
 * existia antes — o módulo é que foi decomposto em auth, rotas e apresentação.
 * Dois serviços para cinco participantes seriam complexidade que este projeto
 * já rejeitou em outros pontos.
 */
export function montarApp() {
  const app = express()

  app.use(express.urlencoded({ extended: false }))

  app.get('/health', (_req, res) => res.json({ ok: true }))

  // Tudo daqui para baixo exige sessão, exceto /login (e /health, acima).
  app.use(rotasLogin)
  app.use(exigirSessao)

  app.use(rotasPainel)
  app.use(rotasUsuario)
  app.use(rotasAcoes)
  app.use(rotasConexao)

  // Erro não tratado vira página legível em vez de stack trace nu. Sem isto,
  // uma coluna faltando no banco devolve 500 em branco e o operador não tem
  // como saber o que aconteceu — foi exatamente o que ocorreu ao subir com um
  // banco de schema antigo.
  app.use((erro, _req, res, _next) => {
    console.error('[admin] erro não tratado:', erro?.stack ?? erro)
    res.status(500).type('html').send(
      pagina(
        'Erro',
        `<h1>Algo quebrou</h1>
         <p><code>${escapar(erro?.message ?? String(erro))}</code></p>
         <p class="nota">Se a mensagem falar em coluna inexistente, o banco provavelmente
         está com schema antigo — ver "Recriar o banco" no README.</p>
         <p><a href="/">voltar ao painel</a></p>`,
      ),
    )
  })

  return app
}

export const app = montarApp()

// Só sobe o servidor quando o arquivo é o entrypoint — assim os renderizadores
// podem ser importados por teste sem abrir porta nenhuma.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  // O admin NÃO sobe sem senha: um admin desprotegido por variável faltando
  // expõe dado de saúde sem que ninguém perceba.
  exigirSenhaConfigurada()
  getDb()

  // Bind explícito: o admin exibe o histórico completo de conversas e permite
  // escrita sobre dado de saúde. Ver openspec/specs/dashboard-piloto.
  app.listen(config.dashboard.port, config.dashboard.host, () => {
    console.log(`[admin] http://${config.dashboard.host}:${config.dashboard.port}`)
    console.log(
      `[admin] acesso remoto: ssh -L ${config.dashboard.port}:localhost:${config.dashboard.port} usuario@<ip>`,
    )
  })
}

export { renderizar, renderizarDetalhe, renderizarConexao }
