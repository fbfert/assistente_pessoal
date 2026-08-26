import { test, describe, before, after, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import Database from 'better-sqlite3'

import { abrirDb, closeDb } from '../src/db/db.js'
import { migrar } from '../src/db/migracoes.js'
import * as repo from '../src/db/userRepo.js'
import { listarInteracoes } from '../src/db/interactionLog.js'
import { processarMensagem } from '../src/conversa/nucleo.js'
import { ESTADOS } from '../src/anamnese/questions.js'
import { CANAIS, TIPOS_INTERACAO } from '../src/constants.js'

/**
 * O núcleo de conversa exercitado SEM NENHUM CANAL.
 *
 * Nada do Baileys aparece aqui: não há número de WhatsApp no caminho, não há
 * objeto de mensagem de biblioteca nenhuma. Só um participante, um texto, um
 * canal e uma função de envio — que é a definição da fronteira que a extração
 * criou. Se um dia algum destes testes precisar importar algo de
 * `src/whatsapp/`, a fronteira vazou.
 */

let dir, db
const NUMERO = '+5511977776666'

let respostas = []
/** A função de envio que o núcleo recebe: sem endereço, sem transporte. */
const responder = async (texto) => {
  respostas.push(texto)
}

const llmFalso = async () => 'resposta do modelo'

before(() => {
  dir = mkdtempSync(join(tmpdir(), 'tars-nucleo-'))
  db = abrirDb(join(dir, 'nucleo.sqlite'))
})

after(() => {
  closeDb()
  rmSync(dir, { recursive: true, force: true })
})

beforeEach(() => {
  db.exec('DELETE FROM historico_interacoes; DELETE FROM remedios; DELETE FROM usuarios;')
  respostas = []
})

/** Participante em um estado de anamnese qualquer, sem passar por canal nenhum. */
function participante(estado = ESTADOS.CONCLUIDO) {
  const u = repo.findOrCreate(NUMERO, db)
  repo.setAnamneseEstado(u.usuario_id, estado, db)
  return repo.findById(u.usuario_id, db)
}

const processar = (usuario, texto, canal = CANAIS.WEB, deps = {}) =>
  processarMensagem({ usuario, texto, canal, responder }, { db, chamar: llmFalso, ...deps })

// =============================================================================

describe('núcleo: anamnese sem canal', () => {
  test('processa um passo de anamnese e responde pela função recebida', async () => {
    const u = participante(ESTADOS.O_QUE_TRAVA)

    const r = await processar(u, 'começar as coisas trava tudo, fico paralisado')

    assert.equal(r.acao, 'anamnese')
    assert.equal(r.estadoAnterior, ESTADOS.O_QUE_TRAVA)
    assert.equal(r.estadoAtual, ESTADOS.ROTINA)
    assert.ok(respostas.length >= 1, 'a resposta saiu pela função injetada')
    assert.equal(
      repo.findById(u.usuario_id, db).o_que_trava,
      'começar as coisas trava tudo, fico paralisado',
    )
  })

  test('a resposta não passa por nenhum endereço', async () => {
    const u = participante(ESTADOS.O_QUE_TRAVA)

    await processar(u, 'barulho constante')

    // `responder` recebe só o texto. Um núcleo que ainda soubesse de telefone
    // precisaria de dois argumentos aqui.
    assert.ok(respostas.every((r) => typeof r === 'string'))
  })

  test('grava o canal na interação da anamnese', async () => {
    const u = participante(ESTADOS.O_QUE_TRAVA)

    await processar(u, 'não consigo começar')

    const linhas = listarInteracoes(u.usuario_id, db)
    assert.ok(linhas.length >= 1)
    assert.ok(linhas.every((l) => l.canal === CANAIS.WEB))
  })
})

describe('núcleo: conversa livre sem canal', () => {
  test('classifica, chama o LLM e devolve a resposta pela função recebida', async () => {
    const u = participante()

    const r = await processar(u, 'hoje foi corrido, não parei')

    assert.equal(r.acao, TIPOS_INTERACAO.DESPEJO_ESPONTANEO)
    assert.equal(r.respondeu, true)
    assert.deepEqual(respostas, ['resposta do modelo'])
  })

  test('falha do LLM não derruba o processamento nem envia nada', async () => {
    const u = participante()

    const r = await processar(u, 'oi', CANAIS.WEB, {
      chamar: async () => {
        throw new Error('provedor fora')
      },
    })

    assert.equal(r.respondeu, false)
    assert.equal(respostas.length, 0)
  })

  test('o texto do participante chega ao LLM como está', async () => {
    const u = participante()
    let recebido = null

    await processar(u, 'preciso lembrar de ligar pro médico', CANAIS.WEB, {
      chamar: async ({ mensagens }) => {
        recebido = mensagens[0].content
        return 'ok'
      },
    })

    assert.equal(recebido, 'preciso lembrar de ligar pro médico')
  })
})

describe('núcleo: o canal é dado, não decisão', () => {
  test('a mesma mensagem no mesmo estado decide igual nos dois canais', async () => {
    const u1 = participante(ESTADOS.SINAL_DE_ALERTA)
    const pelaWeb = await processar(u1, 'começo a roer a unha e a perna balança')
    const respostasWeb = [...respostas]

    db.exec('DELETE FROM historico_interacoes; DELETE FROM usuarios;')
    respostas = []

    const u2 = participante(ESTADOS.SINAL_DE_ALERTA)
    const peloWhatsapp = await processar(u2, 'começo a roer a unha e a perna balança', CANAIS.WHATSAPP)

    assert.equal(pelaWeb.acao, peloWhatsapp.acao)
    assert.equal(pelaWeb.estadoAtual, peloWhatsapp.estadoAtual)
    assert.deepEqual(respostasWeb, respostas)
  })

  test('anamnese começada num canal continua no outro, de onde parou', async () => {
    const u = participante(ESTADOS.O_QUE_TRAVA)

    await processar(u, 'transição entre tarefas', CANAIS.WHATSAPP)
    const meio = repo.findById(u.usuario_id, db)
    const r = await processar(meio, 'de manhã rende, à noite não', CANAIS.WEB)

    assert.equal(r.estadoAnterior, ESTADOS.ROTINA, 'continuou de onde parou')
    assert.equal(r.estadoAtual, ESTADOS.GATILHOS_DE_SOBRECARGA)

    const canais = listarInteracoes(u.usuario_id, db).map((l) => l.canal)
    assert.ok(canais.includes(CANAIS.WHATSAPP) && canais.includes(CANAIS.WEB))
  })

  test('canal desconhecido é recusado antes do banco', async () => {
    const u = participante()

    await assert.rejects(
      () => processarMensagem({ usuario: u, texto: 'oi', canal: 'telegram', responder }, { db }),
      /Canal desconhecido/,
    )
    assert.equal(listarInteracoes(u.usuario_id, db).length, 0, 'nada foi gravado')
  })
})

describe('núcleo: fronteira com os canais', () => {
  test('não importa nada de um canal específico', () => {
    const fonte = readFileSync(new URL('../src/conversa/nucleo.js', import.meta.url), 'utf8')

    const imports = [...fonte.matchAll(/^import .*? from '(.+?)'$/gm)].map((m) => m[1])

    for (const alvo of imports) {
      assert.ok(!alvo.includes('/whatsapp/'), `o núcleo importou um canal: ${alvo}`)
      assert.ok(!alvo.includes('/web/'), `o núcleo importou um canal: ${alvo}`)
      assert.ok(!alvo.includes('baileys'), `o núcleo importou a biblioteca do WhatsApp: ${alvo}`)
    }
  })

  test('o adaptador do WhatsApp não reimplementa decisão do núcleo', () => {
    const fonte = readFileSync(new URL('../src/whatsapp/handler.js', import.meta.url), 'utf8')

    assert.match(fonte, /processarMensagem/, 'o adaptador precisa delegar ao núcleo')
    assert.ok(!fonte.includes('classificarMensagem'), 'classificação é do núcleo')
    assert.ok(!fonte.includes('montarSystemPrompt'), 'montagem de prompt é do núcleo')
    assert.ok(!fonte.includes('processarResposta'), 'máquina de estados é do núcleo')
  })
})

describe('migração de banco existente', () => {
  /** Cria um banco com o schema ANTERIOR a esta mudança, direto do git. */
  function bancoAntigo(nome) {
    const caminho = join(dir, nome)
    const antigo = new Database(caminho)
    antigo.exec(`
      CREATE TABLE usuarios (
        usuario_id INTEGER PRIMARY KEY AUTOINCREMENT,
        numero_whatsapp TEXT NOT NULL UNIQUE,
        anamnese_estado INTEGER NOT NULL DEFAULT 0
      );
      CREATE TABLE historico_interacoes (
        interacao_id INTEGER PRIMARY KEY AUTOINCREMENT,
        usuario_id INTEGER NOT NULL,
        tipo TEXT NOT NULL,
        timestamp TEXT NOT NULL,
        texto TEXT,
        gatilho_relacionado TEXT
      );
      INSERT INTO usuarios (numero_whatsapp) VALUES ('+5511900000000');
      INSERT INTO historico_interacoes (usuario_id, tipo, timestamp, texto)
        VALUES (1, 'anamnese', '2026-01-01T00:00:00Z', 'resposta antiga');
    `)
    return { caminho, antigo }
  }

  test('banco antigo ganha as colunas com os dados preservados', () => {
    const { caminho, antigo } = bancoAntigo('antigo.sqlite')

    const aplicadas = migrar(antigo)

    assert.deepEqual(aplicadas, ['usuarios.data_nascimento', 'historico_interacoes.canal'])
    assert.equal(antigo.prepare('SELECT COUNT(*) n FROM historico_interacoes').get().n, 1)

    const linha = antigo.prepare('SELECT * FROM historico_interacoes').get()
    assert.equal(linha.texto, 'resposta antiga', 'o dado anterior continua lá')
    assert.equal(linha.canal, CANAIS.WHATSAPP, 'linha antiga vale como WhatsApp')
    assert.equal(antigo.prepare('SELECT data_nascimento FROM usuarios').get().data_nascimento, null)

    antigo.close()
    rmSync(caminho, { force: true })
  })

  test('rodar de novo não faz nada', () => {
    const { caminho, antigo } = bancoAntigo('idempotente.sqlite')

    migrar(antigo)
    assert.deepEqual(migrar(antigo), [], 'a segunda passada não altera nada')

    antigo.close()
    rmSync(caminho, { force: true })
  })

  test('o CHECK do canal vale depois da migração', () => {
    const { caminho, antigo } = bancoAntigo('check.sqlite')
    migrar(antigo)

    assert.throws(() =>
      antigo
        .prepare(
          `INSERT INTO historico_interacoes (usuario_id, tipo, timestamp, canal)
                VALUES (1, 'anamnese', '2026-01-01T00:00:00Z', 'telegram')`,
        )
        .run(),
    )

    antigo.close()
    rmSync(caminho, { force: true })
  })
})
