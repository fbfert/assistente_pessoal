import { test, describe, before, after, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

// A senha precisa existir ANTES de config.js ser avaliado — daí os imports
// dinâmicos abaixo, em vez de estáticos (que são içados para antes desta linha).
const SENHA = 'senha-de-teste-do-admin'
const EMAIL = 'operador@xiax.com.br'
process.env.ADMIN_PASSWORD = SENHA
process.env.ADMIN_BOOTSTRAP_EMAIL = EMAIL

let dir, db, servidor, base
let repo, log, conexaoRepo, constantes, queries, admins

before(async () => {
  const { abrirDb } = await import('../src/db/db.js')
  dir = mkdtempSync(join(tmpdir(), 'tars-admin-'))
  db = abrirDb(join(dir, 'admin.sqlite'))

  repo = await import('../src/db/userRepo.js')
  log = await import('../src/db/interactionLog.js')
  conexaoRepo = await import('../src/db/estadoConexaoRepo.js')
  constantes = await import('../src/constants.js')
  queries = await import('../src/dashboard/queries.js')

  admins = await import('../src/db/adminRepo.js')
  await admins.bootstrap({ email: EMAIL, senha: SENHA })

  const { app } = await import('../src/dashboard/server.js')
  servidor = app.listen(0)
  await new Promise((r) => servidor.once('listening', r))
  base = `http://127.0.0.1:${servidor.address().port}`
})

after(async () => {
  const { closeDb } = await import('../src/db/db.js')
  await new Promise((r) => servidor.close(r))
  closeDb()
  rmSync(dir, { recursive: true, force: true })
})

beforeEach(() => {
  db.exec('DELETE FROM historico_interacoes; DELETE FROM contadores; DELETE FROM despejos_semana;')
  db.exec('DELETE FROM gatilhos_configurados; DELETE FROM remedios; DELETE FROM usuarios;')
  db.exec('DELETE FROM estado_conexao;')
  // admin_usuarios NAO e limpo: a conta do operador precisa sobreviver aos casos.
})

// --- utilitários ---------------------------------------------------------------

const cru = (caminho, opcoes = {}) =>
  fetch(base + caminho, { redirect: 'manual', ...opcoes })

async function autenticar() {
  const r = await cru('/login', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ email: EMAIL, senha: SENHA }),
  })
  const cookie = r.headers.get('set-cookie').split(';')[0]
  return cookie
}

let cookie
const get = (caminho) => cru(caminho, { headers: { cookie } })
const post = (caminho, dados) =>
  cru(caminho, {
    method: 'POST',
    headers: { cookie, 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(dados),
  })

function participante(numero = '+5511900000001', { concluido = true } = {}) {
  const u = repo.findOrCreate(numero, db)
  repo.registrarConsentimento(u.usuario_id, 'v1', db)
  repo.salvarCampoAnamnese(u.usuario_id, 'nome', 'Ana', db)
  repo.setPersonalidade(u.usuario_id, 'direto', db)
  if (concluido) repo.concluirAnamnese(u.usuario_id, db)
  return repo.findById(u.usuario_id, db)
}

const auditorias = (usuarioId) =>
  log.listarInteracoes(usuarioId, db).filter((i) => i.tipo === 'acao_admin')

// =============================================================================

describe('autenticação', () => {
  test('rota protegida sem sessão redireciona para o login', async () => {
    const r = await cru('/')

    assert.equal(r.status, 302)
    assert.equal(r.headers.get('location'), '/login')
    // O corpo é o "Found. Redirecting to /login" genérico do Express — o que
    // importa é que nenhum dado do piloto vaze nele.
    const corpo = await r.text()
    assert.ok(!/painel|participante|anamnese|consentimento/i.test(corpo))
  })

  test('página de detalhe sem sessão não expõe nada', async () => {
    const u = participante()
    const r = await cru(`/usuarios/${u.usuario_id}`)

    assert.equal(r.status, 302)
    const corpo = await r.text()
    assert.ok(!corpo.includes('Ana'))
    assert.ok(!corpo.includes(u.numero_whatsapp))
  })

  test('health continua público', async () => {
    const r = await cru('/health')

    assert.equal(r.status, 200)
    assert.deepEqual(await r.json(), { ok: true })
  })

  test('senha errada não cria sessão', async () => {
    const r = await cru('/login', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ email: EMAIL, senha: 'errada' }),
    })

    assert.equal(r.status, 401)
    assert.equal(r.headers.get('set-cookie'), null)
  })

  test('senha certa cria sessão que dá acesso', async () => {
    const c = await autenticar()

    assert.match(c, /^tars_admin=/)
    const r = await cru('/', { headers: { cookie: c } })
    assert.equal(r.status, 200)
  })

  test('cookie tem HttpOnly e SameSite=Strict', async () => {
    const r = await cru('/login', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ email: EMAIL, senha: SENHA }),
    })
    const set = r.headers.get('set-cookie')

    assert.match(set, /HttpOnly/)
    assert.match(set, /SameSite=Strict/)
  })

  test('cookie forjado é rejeitado', async () => {
    const r = await cru('/', { headers: { cookie: 'tars_admin=abc.assinaturafalsa' } })
    assert.equal(r.status, 302)
  })

  test('a senha nunca aparece no HTML servido', async () => {
    const c = await autenticar()
    for (const caminho of ['/login', '/']) {
      const corpo = await (await cru(caminho, { headers: { cookie: c } })).text()
      assert.ok(!corpo.includes(SENHA), `senha vazou em ${caminho}`)
    }
  })

  test('verificação de senha não quebra com tamanhos diferentes', async () => {
    const { gerarHash, conferirHash } = await import('../src/dashboard/senha.js')
    const h = await gerarHash(SENHA)

    assert.equal(await conferirHash('x', h), false)
    assert.equal(await conferirHash('', h), false)
    assert.equal(await conferirHash(SENHA, h), true)
    assert.equal(await conferirHash(SENHA, 'lixo'), false)
  })

  test('e-mail inexistente é recusado como qualquer outra falha', async () => {
    const r = await cru('/login', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ email: 'ninguem@lugar.nenhum', senha: SENHA }),
    })

    assert.equal(r.status, 401)
    assert.match(await r.text(), /E-mail ou senha incorretos/)
  })

  test('a senha nunca é armazenada de forma recuperável', () => {
    const conta = admins.buscarPorEmail(EMAIL, db)

    assert.ok(!conta.senha_hash.includes(SENHA))
    assert.match(conta.senha_hash, /^scrypt\$/)
  })

  test('conta inativa não autentica', async () => {
    const criada = await admins.criarConta(
      { nome: 'Fulano', email: 'inativo@xiax.com.br', senha: 'senha-forte-1' },
      db,
    )
    admins.desativarConta(criada.admin_id, db)

    assert.equal(await admins.autenticar('inativo@xiax.com.br', 'senha-forte-1', db), null)
  })

  test('bootstrap não recria nem mexe na senha existente', async () => {
    const antes = admins.buscarPorEmail(EMAIL, db).senha_hash
    const r = await admins.bootstrap({ email: EMAIL, senha: 'outra-coisa' }, db)

    assert.equal(r.criada, false)
    assert.equal(admins.buscarPorEmail(EMAIL, db).senha_hash, antes)
  })

  test('trocar a própria senha exige a atual', async () => {
    const conta = admins.buscarPorEmail(EMAIL, db)

    const ruim = await admins.trocarSenha(conta.admin_id, 'errada', 'senha-nova-123', db)
    assert.equal(ruim.ok, false)
    assert.equal(await admins.autenticar(EMAIL, SENHA, db) !== null, true)

    const bom = await admins.trocarSenha(conta.admin_id, SENHA, 'senha-nova-123', db)
    assert.equal(bom.ok, true)
    assert.equal(await admins.autenticar(EMAIL, 'senha-nova-123', db) !== null, true)

    // devolve ao estado original para não quebrar os casos seguintes
    await admins.trocarSenha(conta.admin_id, 'senha-nova-123', SENHA, db)
  })

  test('senha nova curta demais é recusada', async () => {
    const conta = admins.buscarPorEmail(EMAIL, db)
    const r = await admins.trocarSenha(conta.admin_id, SENHA, 'curta', db)

    assert.equal(r.ok, false)
    assert.match(r.erro, /8 caracteres/)
  })
})

describe('leitura', () => {
  before(async () => {
    cookie = await autenticar()
  })

  test('esteira separa os três estágios nominalmente', async () => {
    const pendente = repo.findOrCreate('+5511900000010', db)
    const andamento = repo.findOrCreate('+5511900000011', db)
    repo.registrarConsentimento(andamento.usuario_id, 'v1', db)
    repo.setAnamneseEstado(andamento.usuario_id, 5, db)
    participante('+5511900000012')

    const e = queries.esteira(db)

    assert.deepEqual(e.pendentes.map((u) => u.usuarioId), [pendente.usuario_id])
    assert.deepEqual(e.emAndamento.map((u) => u.usuarioId), [andamento.usuario_id])
    assert.equal(e.concluidos.length, 1)
  })

  test('painel lista os grupos da esteira, não só a contagem', async () => {
    participante('+5511900000013')
    const corpo = await (await get('/')).text()

    assert.match(corpo, /Pendentes de consentimento/)
    assert.match(corpo, /Consentiram, anamnese em andamento/)
    assert.match(corpo, /Anamnese concluída/)
  })

  test('detalhe mostra anamnese, remédios, gatilhos e histórico', async () => {
    const u = participante('+5511900000014')
    repo.adicionarRemedio(u.usuario_id, 'Ritalina', '09:00', db)
    log.registrar(
      { usuarioId: u.usuario_id, tipo: 'despejo_espontaneo', texto: 'hoje foi difícil' },
      db,
    )

    const corpo = await (await get(`/usuarios/${u.usuario_id}`)).text()

    assert.match(corpo, /Ana/)
    assert.match(corpo, /Ritalina/)
    assert.match(corpo, /hoje foi difícil/)
    assert.match(corpo, /Consentimento/)
    assert.match(corpo, /v1/)
    assert.match(corpo, /Histórico/)
  })

  test('texto do participante é escapado', async () => {
    const u = participante('+5511900000015')
    repo.salvarCampoAnamnese(u.usuario_id, 'nome', '<script>alert(1)</script>', db)

    const corpo = await (await get(`/usuarios/${u.usuario_id}`)).text()

    assert.ok(!corpo.includes('<script>alert(1)</script>'))
    assert.match(corpo, /&lt;script&gt;/)
  })

  test('leitura NÃO gera linha de auditoria', async () => {
    const u = participante('+5511900000016')

    await get('/')
    await get(`/usuarios/${u.usuario_id}`)
    await get(`/usuarios/${u.usuario_id}/reiniciar`)
    await get(`/usuarios/${u.usuario_id}/anonimizar`)

    assert.equal(auditorias(u.usuario_id).length, 0)
    assert.equal(repo.findById(u.usuario_id, db).nome, 'Ana', 'confirmação não altera nada')
  })

  test('participante inexistente devolve 404', async () => {
    assert.equal((await get('/usuarios/99999')).status, 404)
  })
})

describe('escrita e auditoria', () => {
  before(async () => {
    cookie = await autenticar()
  })

  test('editar campo grava e audita com origem e destino', async () => {
    const u = participante('+5511900000020')

    await post(`/usuarios/${u.usuario_id}/campo`, { campo: 'nome', valor: 'Ana Paula' })

    assert.equal(repo.findById(u.usuario_id, db).nome, 'Ana Paula')
    const a = auditorias(u.usuario_id)
    assert.equal(a.length, 1)
    assert.match(a[0].texto, /nome/)
    assert.match(a[0].texto, /Ana/)
    assert.match(a[0].texto, /Ana Paula/)
    assert.match(a[0].texto, new RegExp(`\\[por ${EMAIL}\\]`), 'a auditoria precisa nomear o autor')
  })

  test('campo fora da whitelist é recusado sem alterar nada', async () => {
    const u = participante('+5511900000021')

    const r = await post(`/usuarios/${u.usuario_id}/campo`, {
      campo: 'consentimento_aceito',
      valor: '0',
    })

    assert.equal(r.status, 400)
    assert.equal(repo.findById(u.usuario_id, db).consentimento_aceito, 1)
    assert.equal(auditorias(u.usuario_id).length, 0)
  })

  test('remédio com horário vazio grava o sentinela (Regra 1b)', async () => {
    const u = participante('+5511900000022')
    const r = repo.adicionarRemedio(u.usuario_id, 'Ritalina', '09:00', db)

    await post(`/usuarios/${u.usuario_id}/remedio/${r.remedio_id}`, {
      nome: 'Ritalina',
      horario: '',
    })

    assert.equal(repo.buscarRemedio(r.remedio_id, db).horario, constantes.SEM_INFORMACAO)
    assert.equal(auditorias(u.usuario_id).length, 1)
  })

  test('remover remédio audita e apaga', async () => {
    const u = participante('+5511900000023')
    const r = repo.adicionarRemedio(u.usuario_id, 'Venvanse', '07:00', db)

    await post(`/usuarios/${u.usuario_id}/remedio/${r.remedio_id}/remover`)

    assert.equal(repo.buscarRemedio(r.remedio_id, db), null)
    assert.match(auditorias(u.usuario_id)[0].texto, /Venvanse/)
  })

  test('ativar o checklist de fim de dia', async () => {
    const u = participante('+5511900000024')
    const checklist = repo
      .listarGatilhosUsuario(u.usuario_id, db)
      .find((g) => g.tipo === 'checklist_fim_dia')
    assert.equal(checklist.ativo, 0)

    await post(`/usuarios/${u.usuario_id}/gatilho/${checklist.gatilho_id}`, {
      horario: '20:00',
      ativo: '1',
    })

    assert.equal(repo.buscarGatilho(checklist.gatilho_id, db).ativo, 1)
    assert.match(auditorias(u.usuario_id)[0].texto, /ativado/)
  })

  test('horário inválido é recusado', async () => {
    const u = participante('+5511900000025')
    const g = repo.listarGatilhosUsuario(u.usuario_id, db)[0]

    const r = await post(`/usuarios/${u.usuario_id}/gatilho/${g.gatilho_id}`, {
      horario: 'oito da manhã',
      ativo: '1',
    })

    assert.equal(r.status, 400)
    assert.equal(repo.buscarGatilho(g.gatilho_id, db).horario, '08:00')
  })

  test('zerar contador de silêncio', async () => {
    const u = participante('+5511900000026')
    repo.incrementarSilencio(u.usuario_id, 'checkin_manha', db)
    repo.incrementarSilencio(u.usuario_id, 'checkin_manha', db)

    await post(`/usuarios/${u.usuario_id}/silencio/checkin_manha`)

    assert.equal(repo.getSilencioConsecutivo(u.usuario_id, 'checkin_manha', db), 0)
    assert.match(auditorias(u.usuario_id)[0].texto, /estava em 2/)
  })

  test('pausar suspende disparos sem alterar a configuração', async () => {
    const u = participante('+5511900000027')
    const antes = repo.listarGatilhosUsuario(u.usuario_id, db).map((g) => [g.gatilho_id, g.ativo])

    await post(`/usuarios/${u.usuario_id}/pausa`, { pausado: '1' })

    assert.equal(repo.findById(u.usuario_id, db).pausado, 1)
    assert.equal(
      repo.listarGatilhosAtivos(db).filter((g) => g.usuario_id === u.usuario_id).length,
      0,
      'pausado não recebe disparo',
    )
    assert.deepEqual(
      repo.listarGatilhosUsuario(u.usuario_id, db).map((g) => [g.gatilho_id, g.ativo]),
      antes,
      'configuração intacta',
    )
  })

  test('despausar restaura exatamente os gatilhos anteriores', async () => {
    const u = participante('+5511900000028')
    const antes = repo.listarGatilhosAtivos(db).filter((g) => g.usuario_id === u.usuario_id).length

    await post(`/usuarios/${u.usuario_id}/pausa`, { pausado: '1' })
    await post(`/usuarios/${u.usuario_id}/pausa`, { pausado: '0' })

    assert.equal(
      repo.listarGatilhosAtivos(db).filter((g) => g.usuario_id === u.usuario_id).length,
      antes,
    )
    assert.equal(auditorias(u.usuario_id).length, 2)
  })

  test('reiniciar anamnese limpa campos, remédios e gatilhos', async () => {
    const u = participante('+5511900000029')
    repo.adicionarRemedio(u.usuario_id, 'Ritalina', '09:00', db)
    log.registrar({ usuarioId: u.usuario_id, tipo: 'anamnese', texto: 'resposta antiga' }, db)

    await post(`/usuarios/${u.usuario_id}/reiniciar`)

    const depois = repo.findById(u.usuario_id, db)
    assert.equal(depois.anamnese_estado, 0)
    assert.equal(depois.nome, null)
    assert.equal(depois.personalidade, null)
    assert.equal(repo.listarRemedios(u.usuario_id, db).length, 0)
    assert.equal(repo.listarGatilhosUsuario(u.usuario_id, db).length, 0)
    assert.equal(depois.consentimento_aceito, 1, 'consentimento permanece')
    assert.ok(
      log.listarInteracoes(u.usuario_id, db).some((i) => i.texto === 'resposta antiga'),
      'histórico é append-only e permanece',
    )
  })
})

describe('convite: convidar × reiniciar são ações distintas', () => {
  before(async () => {
    cookie = await autenticar()
  })

  test('número novo é convidado', async () => {
    await post('/convidar', { numero: '+5511900000030' })

    const u = repo.findByWhatsapp('+5511900000030', db)
    assert.ok(u)
    assert.equal(u.anamnese_estado, 0)
    assert.equal(auditorias(u.usuario_id).length, 1)
  })

  test('número inválido é recusado', async () => {
    const r = await post('/convidar', { numero: 'meu zap' })
    assert.equal(r.status, 400)
  })

  test('convidar quem já tem progresso é BLOQUEADO', async () => {
    // Este é o bug que a leitura do código pegou: convidarPiloto reseta o
    // estado incondicionalmente e apagaria o progresso sem avisar.
    const u = participante('+5511900000031')

    const r = await post('/convidar', { numero: u.numero_whatsapp })

    assert.equal(r.status, 409)
    assert.equal(repo.findById(u.usuario_id, db).anamnese_estado, 12, 'progresso preservado')
  })

  test('reenviar convite bloqueado para quem tem progresso', async () => {
    const u = participante('+5511900000032')

    const r = await post(`/usuarios/${u.usuario_id}/reenviar-convite`)

    assert.equal(r.status, 409)
    assert.equal(repo.findById(u.usuario_id, db).anamnese_estado, 12)
  })

  test('reenviar convite permitido no estado 0 sem consentimento', async () => {
    const u = repo.findOrCreate('+5511900000033', db)

    const r = await post(`/usuarios/${u.usuario_id}/reenviar-convite`)

    assert.equal(r.status, 302)
    assert.equal(auditorias(u.usuario_id).length, 1)
  })
})

describe('anonimização', () => {
  before(async () => {
    cookie = await autenticar()
  })

  test('redige identificação e preserva o rastro de auditoria', async () => {
    const u = participante('+5511900000040')
    repo.adicionarRemedio(u.usuario_id, 'Ritalina', '09:00', db)
    log.registrar(
      { usuarioId: u.usuario_id, tipo: 'anamnese', texto: 'meu nome é Ana, tomo Ritalina às 9' },
      db,
    )

    await post(`/usuarios/${u.usuario_id}/anonimizar`)

    const depois = repo.findById(u.usuario_id, db)
    const R = constantes.REDIGIDO

    assert.equal(depois.numero_whatsapp, `redigido:${u.usuario_id}`)
    assert.equal(depois.nome, R)
    assert.equal(depois.pausado, 1)
    assert.equal(repo.listarRemedios(u.usuario_id, db)[0].nome, R)

    const historico = log.listarInteracoes(u.usuario_id, db)
    assert.ok(
      !historico.some((i) => /Ana|Ritalina/.test(i.texto ?? '')),
      'o texto das conversas também precisa ser redigido — senão a anonimização é fachada',
    )
    assert.ok(historico.every((i) => i.tipo && i.timestamp), 'tipo e timestamp permanecem')

    assert.equal(depois.consentimento_aceito, 1, 'a prova do consentimento permanece')
    assert.equal(depois.consentimento_versao, 'v1')
    assert.ok(depois.consentimento_timestamp)

    assert.equal(auditorias(u.usuario_id).length, 1, 'a própria anonimização é auditada')
  })

  test('o marcador de redação é distinto do sentinela de ausência', () => {
    assert.notEqual(constantes.REDIGIDO, constantes.SEM_INFORMACAO)
  })

  test('participante anonimizado não recebe disparo', async () => {
    const u = participante('+5511900000041')
    await post(`/usuarios/${u.usuario_id}/anonimizar`)

    assert.equal(
      repo.listarGatilhosAtivos(db).filter((g) => g.usuario_id === u.usuario_id).length,
      0,
    )
  })
})

describe('estado de conexão', () => {
  before(async () => {
    cookie = await autenticar()
  })

  test('QR recebido fica disponível e consta como não conectado', () => {
    conexaoRepo.registrarQr('2@abc/def+ghi', db)
    const e = conexaoRepo.lerEstadoConexao(db)

    assert.equal(e.conectado, 0)
    assert.equal(e.qr_atual, '2@abc/def+ghi')
    assert.equal(conexaoRepo.qrEstaValido(e), true)
  })

  test('conexão aberta limpa o QR', () => {
    conexaoRepo.registrarQr('2@abc', db)
    conexaoRepo.registrarConectado(db)
    const e = conexaoRepo.lerEstadoConexao(db)

    assert.equal(e.conectado, 1)
    assert.equal(e.qr_atual, null)
  })

  test('logout é distinguível de queda comum', () => {
    conexaoRepo.registrarDesconectado('loggedOut', db)
    const e = conexaoRepo.lerEstadoConexao(db)

    assert.equal(e.conectado, 0)
    assert.equal(e.motivo_desconexao, 'loggedOut')
  })

  test('segunda linha é rejeitada pelo banco', () => {
    assert.throws(() =>
      db
        .prepare('INSERT INTO estado_conexao (id, conectado, atualizado_em) VALUES (2, 0, ?)')
        .run(new Date().toISOString()),
    )
  })

  test('QR velho é considerado expirado', () => {
    const antigo = new Date(Date.now() - conexaoRepo.VALIDADE_QR_MS - 1000).toISOString()
    assert.equal(conexaoRepo.qrEstaValido({ qr_atual: 'x', atualizado_em: antigo }), false)
  })

  test('página renderiza os três estados', async () => {
    const { renderizarConexao } = await import('../src/dashboard/rotas/conexao.js')

    const conectado = renderizarConexao({
      estado: { conectado: 1, atualizado_em: new Date().toISOString() },
      valido: false,
    })
    assert.match(conectado, /WhatsApp conectado/)

    const aguardando = renderizarConexao({
      estado: { conectado: 0, qr_atual: 'x', atualizado_em: new Date().toISOString() },
      valido: true,
      dataUri: 'data:image/png;base64,AAA',
    })
    assert.match(aguardando, /Aguardando pareamento/)
    assert.match(aguardando, /<img src="data:image\/png/)

    const caido = renderizarConexao({
      estado: {
        conectado: 0,
        qr_atual: null,
        motivo_desconexao: 'loggedOut',
        atualizado_em: new Date().toISOString(),
      },
      valido: false,
    })
    assert.match(caido, /Desconectado/)
    assert.match(caido, /parear de novo/)
  })

  test('a página serve o QR como imagem, não como texto', async () => {
    conexaoRepo.registrarQr('2@qr-de-teste', db)
    const corpo = await (await get('/conexao')).text()

    assert.match(corpo, /<img src="data:image\/png;base64,/)
    assert.ok(!corpo.includes('2@qr-de-teste'), 'o texto bruto do QR não vai para a página')
    assert.match(corpo, /http-equiv="refresh"/)
  })
})


describe('CRUD de administradores', () => {
  let auditoria

  before(async () => {
    auditoria = await import('../src/db/auditoriaAdminRepo.js')
    cookie = await autenticar()
  })

  beforeEach(() => {
    // Mantém só a conta do operador entre os casos.
    db.exec(`DELETE FROM auditoria_admin;
             DELETE FROM admin_usuarios WHERE email != '${EMAIL}';
             UPDATE admin_usuarios SET ativo = 1, precisa_trocar_senha = 0;`)
  })

  const criar = (nome, email) => post('/admins', { nome, email })

  test('criar gera senha temporária exibida UMA vez', async () => {
    const r = await criar('Fulano', 'fulano@xiax.com.br')
    const corpo = await r.text()

    const m = corpo.match(/<code style="font-size:1\.3rem">([^<]+)<\/code>/)
    assert.ok(m, 'a senha gerada precisa aparecer nesta resposta')
    const senha = m[1]

    // ...e não em nenhuma tela posterior.
    const depois = await (await get('/admins')).text()
    assert.ok(!depois.includes(senha), 'a senha não pode reaparecer')

    const conta = admins.buscarPorEmail('fulano@xiax.com.br', db)
    assert.equal(conta.precisa_trocar_senha, 1)
    assert.ok(await admins.autenticar('fulano@xiax.com.br', senha, db))
  })

  test('e-mail já usado é recusado', async () => {
    await criar('Fulano', 'fulano@xiax.com.br')
    const r = await criar('Outro', 'fulano@xiax.com.br')

    assert.equal(r.status, 409)
    assert.equal(admins.listarContas(db).filter((c) => c.email === 'fulano@xiax.com.br').length, 1)
  })

  test('e-mail inválido é recusado', async () => {
    const r = await criar('Fulano', 'não é e-mail')

    assert.equal(r.status, 400)
    assert.equal(admins.listarContas(db).length, 1)
  })

  test('conta com pendência só alcança a troca de senha', async () => {
    const r = await criar('Beltrano', 'beltrano@xiax.com.br')
    const senha = (await r.text()).match(/<code style="font-size:1\.3rem">([^<]+)</)[1]

    const login = await cru('/login', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ email: 'beltrano@xiax.com.br', senha }),
    })
    assert.equal(login.headers.get('location'), '/conta', 'login já leva para a troca')
    const c = login.headers.get('set-cookie').split(';')[0]

    // Painel e detalhe ficam fora do alcance.
    for (const rota of ['/', '/admins', '/conexao']) {
      const bloqueado = await cru(rota, { headers: { cookie: c } })
      assert.equal(bloqueado.status, 302, `${rota} deveria desviar`)
      assert.equal(bloqueado.headers.get('location'), '/conta')
    }

    // Depois de trocar, libera.
    await cru('/conta/senha', {
      method: 'POST',
      headers: { cookie: c, 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ atual: senha, nova: 'senha-nova-forte', confirmacao: 'senha-nova-forte' }),
    })
    assert.equal(admins.buscarPorEmail('beltrano@xiax.com.br', db).precisa_trocar_senha, 0)
  })

  test('não é possível desativar a própria conta', async () => {
    const eu = admins.buscarPorEmail(EMAIL, db)
    const r = await post(`/admins/${eu.admin_id}/desativar`)

    assert.equal(r.status, 409)
    assert.equal(admins.buscarPorId(eu.admin_id, db).ativo, 1)
  })

  test('a última conta ativa é protegida', async () => {
    const eu = admins.buscarPorEmail(EMAIL, db)
    // Guarda de servidor, chamada direto: mesmo sem passar por quem age.
    const r = admins.desativarConta(eu.admin_id, {}, db)

    assert.equal(r.ok, false)
    assert.match(r.erro, /última conta ativa/)
    assert.equal(admins.contarAtivos(db), 1)
  })

  test('desativar e reativar outra conta', async () => {
    await criar('Fulano', 'fulano@xiax.com.br')
    const alvo = admins.buscarPorEmail('fulano@xiax.com.br', db)

    await post(`/admins/${alvo.admin_id}/desativar`)
    assert.equal(admins.buscarPorId(alvo.admin_id, db).ativo, 0)
    assert.ok(admins.buscarPorId(alvo.admin_id, db), 'a linha NÃO é apagada')

    await post(`/admins/${alvo.admin_id}/reativar`)
    assert.equal(admins.buscarPorId(alvo.admin_id, db).ativo, 1)
  })

  test('reset gera senha nova e obriga a troca', async () => {
    await criar('Fulano', 'fulano@xiax.com.br')
    const alvo = admins.buscarPorEmail('fulano@xiax.com.br', db)
    const hashAntes = alvo.senha_hash

    const r = await post(`/admins/${alvo.admin_id}/resetar`)
    const nova = (await r.text()).match(/<code style="font-size:1\.3rem">([^<]+)</)[1]

    const depois = admins.buscarPorId(alvo.admin_id, db)
    assert.notEqual(depois.senha_hash, hashAntes)
    assert.equal(depois.precisa_trocar_senha, 1)
    assert.ok(await admins.autenticar('fulano@xiax.com.br', nova, db))
  })

  test('auditoria de equipe registra autor, ação e alvo', async () => {
    await criar('Fulano', 'fulano@xiax.com.br')
    const linhas = auditoria.listarAuditoriaAdmin(10, db)

    const criacao = linhas.find((l) => l.acao === 'criou')
    assert.ok(criacao)
    assert.equal(criacao.autor_email, EMAIL)
    assert.match(criacao.descricao, /fulano@xiax\.com\.br/)
  })

  test('a senha gerada NUNCA entra no log de auditoria', async () => {
    const r = await criar('Fulano', 'fulano@xiax.com.br')
    const senha = (await r.text()).match(/<code style="font-size:1\.3rem">([^<]+)</)[1]

    for (const l of auditoria.listarAuditoriaAdmin(50, db)) {
      assert.ok(!l.descricao.includes(senha), 'senha vazou na auditoria')
    }
  })

  test('ação sobre a equipe NÃO polui a linha do tempo dos participantes', async () => {
    const antes = db.prepare('SELECT COUNT(*) n FROM historico_interacoes').get().n

    await criar('Fulano', 'fulano@xiax.com.br')

    assert.equal(db.prepare('SELECT COUNT(*) n FROM historico_interacoes').get().n, antes)
  })

  test('o autor continua identificado depois de desativado', async () => {
    await criar('Fulano', 'fulano@xiax.com.br')
    const alvo = admins.buscarPorEmail('fulano@xiax.com.br', db)
    await post(`/admins/${alvo.admin_id}/desativar`)

    const linhas = auditoria.listarAuditoriaAdmin(10, db)
    assert.ok(linhas.every((l) => l.autor_email === EMAIL))
  })

  test('a listagem nunca mostra hash de senha', async () => {
    await criar('Fulano', 'fulano@xiax.com.br')
    const corpo = await (await get('/admins')).text()

    assert.ok(!corpo.includes('scrypt$'))
  })
})


describe('trocar personalidade do participante', () => {
  before(async () => {
    cookie = await autenticar()
  })

  test('troca aplicada e auditada com origem, destino e autor', async () => {
    const u = participante('+5511900000050')
    assert.equal(u.personalidade, 'direto')

    await post(`/usuarios/${u.usuario_id}/personalidade`, { personalidade: 'caloroso' })

    assert.equal(repo.findById(u.usuario_id, db).personalidade, 'caloroso')

    const a = auditorias(u.usuario_id)
    assert.equal(a.length, 1)
    assert.match(a[0].texto, /personalidade/)
    assert.match(a[0].texto, /direto/)
    assert.match(a[0].texto, /caloroso/)
    assert.match(a[0].texto, new RegExp(`\\[por ${EMAIL}\\]`))
  })

  test('valor inválido é recusado ANTES do banco, com mensagem legível', async () => {
    const u = participante('+5511900000051')

    const r = await post(`/usuarios/${u.usuario_id}/personalidade`, {
      personalidade: 'sarcastico',
    })

    assert.equal(r.status, 400)
    assert.match(await r.text(), /não é uma das três opções/)
    assert.equal(repo.findById(u.usuario_id, db).personalidade, 'direto', 'valor anterior mantido')
    assert.equal(auditorias(u.usuario_id).length, 0)
  })

  test('salvar o mesmo valor não gera auditoria', async () => {
    const u = participante('+5511900000052')

    await post(`/usuarios/${u.usuario_id}/personalidade`, { personalidade: 'direto' })

    assert.equal(auditorias(u.usuario_id).length, 0, 'nada mudou, nada a auditar')
  })

  test('as três opções aparecem na tela, como opções fechadas', async () => {
    const u = participante('+5511900000053')
    const corpo = await (await get(`/usuarios/${u.usuario_id}`)).text()

    assert.match(corpo, /<select name="personalidade">/)
    for (const v of ['direto', 'caloroso', 'neutro']) {
      assert.match(corpo, new RegExp(`<option value="${v}"`))
    }
    // Não é campo de texto livre encaixado no form genérico de anamnese.
    assert.ok(!/name="campo" value="personalidade"/.test(corpo))
  })
})
