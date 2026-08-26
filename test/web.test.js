import { test, describe, before, after, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { abrirDb, closeDb } from '../src/db/db.js'
import { config } from '../src/config.js'
import * as repo from '../src/db/userRepo.js'
import * as sessoes from '../src/db/sessaoWebRepo.js'
import { listarInteracoes } from '../src/db/interactionLog.js'
import { convidarPiloto } from '../src/admin/convidarPiloto.js'
import { criarAppWeb } from '../src/web/servidor.js'
import { _limparTudo } from '../src/web/tentativas.js'
import { ESTADOS, TEXTO_CONSENTIMENTO } from '../src/anamnese/questions.js'
import { CANAIS, TIPOS_INTERACAO } from '../src/constants.js'

/**
 * Rotas públicas do canal web.
 *
 * Servidor de verdade, SQLite de verdade, núcleo de verdade. O que não é real
 * aqui é o LLM — e o WhatsApp não aparece em lugar nenhum, que é o ponto.
 */

let dir, db, servidor, base
const TELEFONE = '+5511955554444'
const NASCIMENTO = '1990-04-23'

const entrar = (corpo) =>
  fetch(`${base}/web/entrar`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(corpo),
  })

const mandar = (token, corpo) =>
  fetch(`${base}/web/mensagem`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(corpo),
  })

/** Convida como o admin faz, com data — e sem mandar WhatsApp nenhum. */
async function convidado(telefone = TELEFONE, nascimento = NASCIMENTO) {
  const u = await convidarPiloto(telefone, async () => {}, db, nascimento)
  return u
}

before(async () => {
  dir = mkdtempSync(join(tmpdir(), 'tars-web-'))
  db = abrirDb(join(dir, 'web.sqlite'))

  // O atraso por falha é real em produção; aqui ele só faria a suíte esperar.
  config.web.atrasoFalhaMs = 0

  servidor = criarAppWeb(db).listen(0)
  await new Promise((r) => servidor.once('listening', r))
  base = `http://127.0.0.1:${servidor.address().port}`
})

after(async () => {
  await new Promise((r) => servidor.close(r))
  closeDb()
  rmSync(dir, { recursive: true, force: true })
})

beforeEach(() => {
  db.exec('DELETE FROM sessoes_web; DELETE FROM historico_interacoes; DELETE FROM usuarios;')
  _limparTudo()
})

// =============================================================================

describe('POST /web/entrar', () => {
  test('telefone e data corretos criam sessão', async () => {
    const u = await convidado()

    const r = await entrar({ telefone: TELEFONE, dataNascimento: NASCIMENTO })
    const corpo = await r.json()

    assert.equal(r.status, 200)
    assert.ok(corpo.token, 'devolveu o token')
    assert.ok(corpo.expiraEm, 'e quando ele vence')
    assert.equal(sessoes.validar(corpo.token, db), u.usuario_id)
  })

  test('formatação do telefone não importa', async () => {
    await convidado()

    const r = await entrar({ telefone: '+55 (11) 95555-4444', dataNascimento: NASCIMENTO })

    assert.equal(r.status, 200)
  })

  test('a resposta não carrega dado da pessoa', async () => {
    const u = await convidado()
    repo.salvarCampoAnamnese(u.usuario_id, 'nome', 'Ana', db)

    const corpo = await (await entrar({ telefone: TELEFONE, dataNascimento: NASCIMENTO })).json()

    assert.deepEqual(Object.keys(corpo).sort(), ['expiraEm', 'mensagemInicial', 'token'])
    const bruto = JSON.stringify(corpo)
    assert.ok(!bruto.includes('Ana'), 'nome não sai na resposta')
    assert.ok(!bruto.includes('5555'), 'nem pedaço do telefone')
  })

  test('quem ainda não consentiu recebe o texto de consentimento', async () => {
    await convidado()

    const corpo = await (await entrar({ telefone: TELEFONE, dataNascimento: NASCIMENTO })).json()

    assert.equal(corpo.mensagemInicial, TEXTO_CONSENTIMENTO, 'o MESMO texto do WhatsApp')
  })

  test('quem já passou do consentimento não recebe mensagem inicial', async () => {
    const u = await convidado()
    repo.setAnamneseEstado(u.usuario_id, ESTADOS.CONCLUIDO, db)

    const corpo = await (await entrar({ telefone: TELEFONE, dataNascimento: NASCIMENTO })).json()

    assert.equal(corpo.mensagemInicial, null)
  })

  test('a entrada fica registrada no histórico, com tipo e canal próprios', async () => {
    const u = await convidado()

    await entrar({ telefone: TELEFONE, dataNascimento: NASCIMENTO })

    const linha = listarInteracoes(u.usuario_id, db).find(
      (l) => l.tipo === TIPOS_INTERACAO.ENTRADA_WEB,
    )
    assert.ok(linha, 'a entrada precisa ficar registrada')
    assert.equal(linha.canal, CANAIS.WEB)
  })

  test('data errada não cria sessão', async () => {
    await convidado()

    const r = await entrar({ telefone: TELEFONE, dataNascimento: '1991-04-23' })

    assert.equal(r.status, 401)
    assert.equal(db.prepare('SELECT COUNT(*) n FROM sessoes_web').get().n, 0)
  })

  test('telefone desconhecido NUNCA cria participante', async () => {
    const r = await entrar({ telefone: '+5511911112222', dataNascimento: NASCIMENTO })

    assert.equal(r.status, 401)
    assert.equal(db.prepare('SELECT COUNT(*) n FROM usuarios').get().n, 0, 'nada foi criado')
    assert.equal(db.prepare('SELECT COUNT(*) n FROM sessoes_web').get().n, 0)
  })

  test('participante sem data cadastrada não entra', async () => {
    // O caso de quem foi convidado antes da coluna existir.
    await convidarPiloto(TELEFONE, async () => {}, db)

    const r = await entrar({ telefone: TELEFONE, dataNascimento: NASCIMENTO })

    assert.equal(r.status, 401)
  })

  test('as três recusas são indistinguíveis', async () => {
    await convidarPiloto('+5511900001111', async () => {}, db) // existe, sem data
    await convidado()

    const respostas = await Promise.all([
      entrar({ telefone: '+5511999998888', dataNascimento: NASCIMENTO }), // não existe
      entrar({ telefone: TELEFONE, dataNascimento: '1980-01-01' }), // data errada
      entrar({ telefone: '+5511900001111', dataNascimento: NASCIMENTO }), // sem data
    ])

    const corpos = await Promise.all(respostas.map((r) => r.json()))
    assert.deepEqual(new Set(respostas.map((r) => r.status)), new Set([401]))
    assert.equal(new Set(corpos.map((c) => JSON.stringify(c))).size, 1, 'mesma resposta')
  })
})

describe('limite de tentativas', () => {
  test('bloqueia depois do limite, por telefone', async () => {
    await convidado()

    for (let i = 0; i < config.web.maxTentativas; i++) {
      const r = await entrar({ telefone: TELEFONE, dataNascimento: '1900-01-01' })
      assert.equal(r.status, 401, `tentativa ${i + 1} deveria só falhar`)
    }

    // A seguinte é bloqueada — e nem a data CORRETA passa mais.
    const r = await entrar({ telefone: TELEFONE, dataNascimento: NASCIMENTO })

    assert.equal(r.status, 429)
    assert.match((await r.json()).erro, /Muitas tentativas/)
    assert.equal(db.prepare('SELECT COUNT(*) n FROM sessoes_web').get().n, 0)
  })

  test('bloqueia por origem, mesmo variando o telefone', async () => {
    await convidado()

    for (let i = 0; i < config.web.maxTentativas; i++) {
      await entrar({ telefone: `+551190000${1000 + i}`, dataNascimento: '1900-01-01' })
    }

    const r = await entrar({ telefone: TELEFONE, dataNascimento: NASCIMENTO })

    assert.equal(r.status, 429, 'a origem já estava bloqueada')
  })

  test('sucesso zera as contagens', async () => {
    await convidado()

    for (let i = 0; i < config.web.maxTentativas - 1; i++) {
      await entrar({ telefone: TELEFONE, dataNascimento: '1900-01-01' })
    }

    assert.equal((await entrar({ telefone: TELEFONE, dataNascimento: NASCIMENTO })).status, 200)

    // Depois do sucesso, o orçamento de falhas recomeça.
    for (let i = 0; i < config.web.maxTentativas - 1; i++) {
      const r = await entrar({ telefone: TELEFONE, dataNascimento: '1900-01-01' })
      assert.equal(r.status, 401, 'ainda dentro do limite')
    }
  })
})

describe('POST /web/mensagem', () => {
  async function comSessao() {
    const u = await convidado()
    repo.setAnamneseEstado(u.usuario_id, ESTADOS.CONCLUIDO, db)
    const { token } = await (await entrar({ telefone: TELEFONE, dataNascimento: NASCIMENTO })).json()
    return { usuario: repo.findById(u.usuario_id, db), token }
  }

  test('sem token é rejeitada', async () => {
    await comSessao()

    const r = await mandar(null, { texto: 'oi' })

    assert.equal(r.status, 401)
  })

  test('com token inventado é rejeitada', async () => {
    await comSessao()

    const r = await mandar('token-que-nunca-existiu', { texto: 'oi' })

    assert.equal(r.status, 401)
  })

  test('com token válido chama o núcleo e grava com canal web', async () => {
    const { usuario, token } = await comSessao()

    const r = await mandar(token, { texto: 'hoje foi puxado' })
    const corpo = await r.json()

    assert.equal(r.status, 200)
    assert.ok(Array.isArray(corpo.respostas))

    // O convite também deixa linha no histórico, então a busca é pelo texto.
    const linha = listarInteracoes(usuario.usuario_id, db).find(
      (l) => l.texto === 'hoje foi puxado',
    )
    assert.ok(linha, 'a mensagem precisa estar registrada')
    assert.equal(linha.canal, CANAIS.WEB)
    assert.equal(linha.tipo, TIPOS_INTERACAO.DESPEJO_ESPONTANEO)
  })

  test('a anamnese avança pela web, com o mesmo conteúdo', async () => {
    const u = await convidado()
    repo.setAnamneseEstado(u.usuario_id, ESTADOS.O_QUE_TRAVA, db)
    const { token } = await (await entrar({ telefone: TELEFONE, dataNascimento: NASCIMENTO })).json()

    const corpo = await (await mandar(token, { texto: 'começar qualquer coisa trava' })).json()

    assert.ok(corpo.respostas.length >= 1)
    assert.equal(repo.findById(u.usuario_id, db).anamnese_estado, ESTADOS.ROTINA)
    assert.equal(repo.findById(u.usuario_id, db).o_que_trava, 'começar qualquer coisa trava')
  })

  test('identificador no corpo não troca de participante', async () => {
    const { usuario, token } = await comSessao()
    const outro = await convidado('+5511900002222', '1985-01-01')

    await mandar(token, {
      texto: 'mensagem do dono da sessão',
      usuarioId: outro.usuario_id,
      telefone: '+5511900002222',
    })

    const noOutro = listarInteracoes(outro.usuario_id, db).map((l) => l.texto)
    const noDono = listarInteracoes(usuario.usuario_id, db).map((l) => l.texto)

    assert.ok(!noOutro.includes('mensagem do dono da sessão'), 'a mensagem foi para o outro')
    assert.ok(noDono.includes('mensagem do dono da sessão'), 'ficou com o dono da sessão')
  })

  test('mensagem vazia é recusada', async () => {
    const { token } = await comSessao()

    assert.equal((await mandar(token, { texto: '   ' })).status, 400)
  })
})

describe('sessão', () => {
  test('o token não é recuperável do banco', async () => {
    await convidado()
    const { token } = await (await entrar({ telefone: TELEFONE, dataNascimento: NASCIMENTO })).json()

    const linhas = db.prepare('SELECT * FROM sessoes_web').all()

    assert.equal(linhas.length, 1)
    assert.ok(!JSON.stringify(linhas).includes(token), 'o token em claro está no banco')
  })

  test('expirada exige entrar de novo, e o histórico anterior continua lá', async () => {
    const u = await convidado()
    repo.setAnamneseEstado(u.usuario_id, ESTADOS.CONCLUIDO, db)

    const primeira = await (
      await entrar({ telefone: TELEFONE, dataNascimento: NASCIMENTO })
    ).json()
    await mandar(primeira.token, { texto: 'primeira conversa' })

    const antes = listarInteracoes(u.usuario_id, db).length
    assert.ok(antes >= 2)

    // Vence a sessão sem tocar em mais nada.
    db.prepare('UPDATE sessoes_web SET expira_em = ?').run('2020-01-01T00:00:00.000Z')

    assert.equal((await mandar(primeira.token, { texto: 'e agora?' })).status, 401)

    // Nada do histórico foi perdido por causa da expiração.
    assert.equal(listarInteracoes(u.usuario_id, db).length, antes, 'expirar não apaga conversa')

    // Entrar de novo com o mesmo par continua de onde parou.
    const segunda = await (
      await entrar({ telefone: TELEFONE, dataNascimento: NASCIMENTO })
    ).json()
    assert.ok(segunda.token)
    assert.notEqual(segunda.token, primeira.token)

    await mandar(segunda.token, { texto: 'voltei' })

    const textos = listarInteracoes(u.usuario_id, db).map((l) => l.texto)
    assert.ok(textos.includes('primeira conversa'), 'a conversa antiga continua acessível')
    assert.ok(textos.includes('voltei'))
  })

  test('a validade é de inatividade: usar renova', async () => {
    const u = await convidado()
    repo.setAnamneseEstado(u.usuario_id, ESTADOS.CONCLUIDO, db)
    const { token, expiraEm } = await (
      await entrar({ telefone: TELEFONE, dataNascimento: NASCIMENTO })
    ).json()

    await new Promise((r) => setTimeout(r, 10))
    await mandar(token, { texto: 'ainda aqui' })

    const nova = db.prepare('SELECT expira_em FROM sessoes_web').get().expira_em
    assert.ok(new Date(nova) > new Date(expiraEm), 'a expiração foi empurrada para frente')
  })

  test('anonimizar encerra o acesso na hora', async () => {
    const u = await convidado()
    repo.setAnamneseEstado(u.usuario_id, ESTADOS.CONCLUIDO, db)
    const { token } = await (await entrar({ telefone: TELEFONE, dataNascimento: NASCIMENTO })).json()

    repo.anonimizarParticipante(u.usuario_id, db)

    assert.equal((await mandar(token, { texto: 'oi' })).status, 401)
    assert.equal(db.prepare('SELECT COUNT(*) n FROM sessoes_web').get().n, 0)
    assert.notEqual(repo.findById(u.usuario_id, db).data_nascimento, NASCIMENTO)
  })
})

describe('página pública', () => {
  const pegar = (caminho) => fetch(`${base}${caminho}`)

  test('a página é servida pelo mesmo processo, sem login de admin', async () => {
    const r = await pegar('/')

    assert.equal(r.status, 200)
    assert.match(r.headers.get('content-type'), /text\/html/)

    const html = await r.text()
    assert.match(html, /id="tela-entrada"/)
    assert.match(html, /id="tela-conversa"/)
    assert.match(html, /lang="pt-BR"/)
  })

  test('estilo e script são servidos, e são os únicos recursos', async () => {
    const html = await (await pegar('/')).text()

    assert.equal((await pegar('/estilo.css')).status, 200)
    assert.equal((await pegar('/app.js')).status, 200)

    // Nenhuma origem externa: a CSP recusaria, e aqui a gente pega antes.
    const externos = [...html.matchAll(/(?:src|href)="([^"]+)"/g)].map((m) => m[1])
    for (const alvo of externos) {
      assert.ok(alvo.startsWith('/'), `recurso não é local: ${alvo}`)
    }
  })

  test('sem script nem estilo embutidos — a CSP não abre exceção', async () => {
    const html = await (await pegar('/')).text()

    assert.ok(!/<script(?![^>]*\bsrc=)/i.test(html), 'script embutido exigiria unsafe-inline')
    assert.ok(!/<style/i.test(html), 'estilo embutido exigiria unsafe-inline')
    assert.ok(!/\son[a-z]+=/i.test(html), 'nenhum manipulador inline')
  })

  test('a CSP prende tudo na própria origem', async () => {
    const csp = (await pegar('/')).headers.get('content-security-policy')

    assert.match(csp, /default-src 'self'/)
    assert.match(csp, /script-src 'self'/)
    assert.ok(!csp.includes('unsafe-inline'), 'unsafe-inline anularia a política')
    assert.match(csp, /frame-ancestors 'none'/)
  })

  test('o cliente escreve texto, nunca marcação', async () => {
    const fonte = await (await pegar('/app.js')).text()
    // Comentários fora: o arquivo EXPLICA por que não usa innerHTML, e a
    // explicação não pode fazer o teste falhar.
    const codigo = fonte.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

    // É o que faz uma mensagem parecida com HTML aparecer como texto na conversa.
    assert.ok(!codigo.includes('innerHTML'), 'innerHTML transformaria texto em marcação')
    assert.ok(!codigo.includes('insertAdjacentHTML'))
    assert.ok(!codigo.includes('document.write'))
    assert.match(codigo, /textContent/)
  })

  test('o cliente não contém regra de negócio', async () => {
    const fonte = await (await pegar('/app.js')).text()

    for (const proibido of ['anamnese_estado', 'CONSENTIMENTO', 'personalidade', 'gatilho']) {
      assert.ok(!fonte.includes(proibido), `a página não pode conhecer "${proibido}"`)
    }
  })
})

describe('o canal web é só reativo', () => {
  test('nenhuma rota do canal web dispara gatilho, e o scheduler não o conhece', async () => {
    const { readFileSync } = await import('node:fs')

    // Sem comentários: os dois arquivos EXPLICAM a fronteira, e a explicação não
    // pode fazer o teste falhar.
    const semComentario = (caminho) =>
      readFileSync(new URL(caminho, import.meta.url), 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/^\s*\/\/.*$/gm, '')

    const servidor = semComentario('../src/web/servidor.js')
    const scheduler = semComentario('../src/triggers/scheduler.js')

    // O canal web não sabe o que é gatilho: não agenda, não dispara, não lembra.
    for (const proibido of ['scheduler', 'gatilho', 'cron', 'GATILHO_DISPARADO']) {
      assert.ok(!servidor.includes(proibido), `o canal web não pode conhecer "${proibido}"`)
    }

    // E o scheduler não sabe o que é web: continua entregando pelo WhatsApp.
    for (const proibido of ["'web'", 'CANAIS.WEB', 'sessoes_web']) {
      assert.ok(!scheduler.includes(proibido), `o scheduler não pode alcançar a web: "${proibido}"`)
    }
  })

  test('participante que só usa a web continua com gatilho de WhatsApp', async () => {
    const u = await convidado()
    repo.setAnamneseEstado(u.usuario_id, ESTADOS.CONCLUIDO, db)
    repo.ativarGatilhosPadrao(u.usuario_id, db)

    const { token } = await (await entrar({ telefone: TELEFONE, dataNascimento: NASCIMENTO })).json()
    await mandar(token, { texto: 'oi' })

    const gatilhos = repo.listarGatilhosUsuario(u.usuario_id, db)
    assert.ok(gatilhos.length > 0, 'os gatilhos continuam existindo')

    // Nada que o canal web faça cria disparo: quem dispara é o scheduler, e ele
    // só fala WhatsApp.
    const disparos = listarInteracoes(u.usuario_id, db).filter(
      (l) => l.tipo === TIPOS_INTERACAO.GATILHO_DISPARADO,
    )
    assert.equal(disparos.length, 0)
  })
})
