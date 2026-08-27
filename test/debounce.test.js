import { test, describe, before, after, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { abrirDb, closeDb } from '../src/db/db.js'
import * as repo from '../src/db/userRepo.js'
import * as cfg from '../src/db/configRepo.js'
import { agrupar, pendentes, _limpar } from '../src/whatsapp/debounce.js'
import { tratarMensagemRecebida } from '../src/whatsapp/handler.js'
import { ESTADOS } from '../src/anamnese/questions.js'

/**
 * Agrupamento de rajada, com TIMERS CONTROLADOS.
 *
 * Nenhum teste aqui espera segundos de verdade: o agendador é injetado, e o
 * disparo é provocado à mão. Teste que dorme é teste que alguém vai apagar.
 */

let dir, db
const NUMERO = '+5511900007777'

/** Agendador falso: guarda o callback e devolve um identificador. */
function relogioFalso() {
  const agendados = new Map()
  let proximo = 1

  return {
    agendar: (fn, ms) => {
      const id = proximo++
      agendados.set(id, { fn, ms })
      return id
    },
    cancelar: (id) => agendados.delete(id),
    /** Dispara o único timer pendente. */
    async avancar() {
      const [id, { fn }] = [...agendados.entries()].at(-1)
      agendados.delete(id)
      await fn()
    },
    quantos: () => agendados.size,
  }
}

before(() => {
  dir = mkdtempSync(join(tmpdir(), 'tars-debounce-'))
  db = abrirDb(join(dir, 'debounce.sqlite'))
})

after(() => {
  closeDb()
  rmSync(dir, { recursive: true, force: true })
})

beforeEach(() => {
  db.exec('DELETE FROM historico_interacoes; DELETE FROM usuarios; DELETE FROM config_global;')
  cfg.invalidar()
  _limpar()
})

describe('o agrupador', () => {
  test('desligado (zero) processa na hora — o comportamento de sempre', () => {
    const processadas = []
    const r = agrupar(1, 'oi', (t) => processadas.push(t), { segundos: 0 })

    assert.equal(r.agrupou, false)
    assert.deepEqual(processadas, ['oi'])
  })

  test('três mensagens na janela viram UMA, na ordem de chegada', async () => {
    const relogio = relogioFalso()
    const processadas = []
    const deps = { segundos: 5, agendar: relogio.agendar, cancelar: relogio.cancelar }

    agrupar(1, 'primeira', (t) => processadas.push(t), deps)
    agrupar(1, 'segunda', (t) => processadas.push(t), deps)
    agrupar(1, 'terceira', (t) => processadas.push(t), deps)

    assert.deepEqual(processadas, [], 'nada foi processado ainda')
    assert.equal(pendentes(1), 3)
    assert.equal(relogio.quantos(), 1, 'cada mensagem reinicia a contagem, não empilha timer')

    await relogio.avancar()

    assert.deepEqual(processadas, ['primeira\nsegunda\nterceira'])
    assert.equal(pendentes(1), 0)
  })

  test('mensagens espaçadas viram respostas separadas', async () => {
    const relogio = relogioFalso()
    const processadas = []
    const deps = { segundos: 5, agendar: relogio.agendar, cancelar: relogio.cancelar }

    agrupar(1, 'primeira', (t) => processadas.push(t), deps)
    await relogio.avancar()

    agrupar(1, 'segunda', (t) => processadas.push(t), deps)
    await relogio.avancar()

    assert.deepEqual(processadas, ['primeira', 'segunda'])
  })

  test('cada participante tem o próprio buffer', async () => {
    const relogio = relogioFalso()
    const processadas = []
    const deps = { segundos: 5, agendar: relogio.agendar, cancelar: relogio.cancelar }

    agrupar(1, 'da pessoa 1', (t) => processadas.push(t), deps)
    agrupar(2, 'da pessoa 2', (t) => processadas.push(t), deps)

    assert.equal(pendentes(1), 1)
    assert.equal(pendentes(2), 1)
    assert.equal(relogio.quantos(), 2)
  })
})

describe('no fluxo do WhatsApp', () => {
  const enviadas = []
  const enviar = async (_numero, texto) => enviadas.push(texto)

  function participante(estado) {
    const u = repo.findOrCreate(NUMERO, db)
    repo.setAnamneseEstado(u.usuario_id, estado, db)
    return repo.findById(u.usuario_id, db)
  }

  beforeEach(() => {
    enviadas.length = 0
  })

  test('com zero, o retorno é o do núcleo — nada muda', async () => {
    participante(ESTADOS.CONCLUIDO)

    const r = await tratarMensagemRecebida({ numero: NUMERO, texto: 'oi' }, enviar, {
      db,
      chamar: async () => 'resposta',
    })

    assert.equal(r.acao, 'despejo_espontaneo')
    assert.equal(r.respondeu, true)
    assert.deepEqual(enviadas, ['resposta'])
  })

  test('com a janela aberta, a rajada vira uma resposta só', async () => {
    const u = participante(ESTADOS.CONCLUIDO)
    const relogio = relogioFalso()
    const deps = {
      db,
      chamar: async () => 'resposta única',
      debounce: { segundos: 5, agendar: relogio.agendar, cancelar: relogio.cancelar },
    }

    for (const texto of ['to sem energia', 'e sem paciência', 'me ajuda?']) {
      const r = await tratarMensagemRecebida({ numero: NUMERO, texto }, enviar, deps)
      assert.equal(r.acao, 'agrupando')
    }

    assert.deepEqual(enviadas, [], 'ninguém recebeu resposta ainda')

    await relogio.avancar()

    assert.deepEqual(enviadas, ['resposta única'])

    // O núcleo viu as três juntas, como uma mensagem só.
    const { listarInteracoes } = await import('../src/db/interactionLog.js')
    const recebida = listarInteracoes(u.usuario_id, db).find(
      (l) => l.tipo === 'despejo_espontaneo',
    )
    assert.equal(recebida.texto, 'to sem energia\ne sem paciência\nme ajuda?')
  })

  test('durante a ANAMNESE, nunca agrupa — mesmo com a janela aberta', async () => {
    const u = participante(ESTADOS.O_QUE_TRAVA)
    const relogio = relogioFalso()

    const r = await tratarMensagemRecebida(
      { numero: NUMERO, texto: 'começar as coisas trava tudo' },
      enviar,
      {
        db,
        debounce: { segundos: 60, agendar: relogio.agendar, cancelar: relogio.cancelar },
      },
    )

    assert.equal(r.acao, 'anamnese', 'a anamnese não passa pelo buffer')
    assert.equal(relogio.quantos(), 0, 'nem agendou nada')
    assert.equal(repo.findById(u.usuario_id, db).o_que_trava, 'começar as coisas trava tudo')
  })

  test('áudio entra no grupo na ordem em que chegou', async () => {
    participante(ESTADOS.CONCLUIDO)
    const relogio = relogioFalso()
    const deps = {
      db,
      chamar: async () => 'ok',
      transcrever: async () => ({ ok: true, texto: 'isto veio de um áudio' }),
      debounce: { segundos: 5, agendar: relogio.agendar, cancelar: relogio.cancelar },
    }

    await tratarMensagemRecebida({ numero: NUMERO, texto: 'antes do áudio' }, enviar, deps)
    await tratarMensagemRecebida(
      { numero: NUMERO, audio: { buffer: Buffer.from([1]), mimeType: 'audio/ogg' } },
      enviar,
      deps,
    )
    await tratarMensagemRecebida({ numero: NUMERO, texto: 'depois do áudio' }, enviar, deps)

    await relogio.avancar()

    const { listarInteracoes } = await import('../src/db/interactionLog.js')
    const u = repo.findByWhatsapp(NUMERO, db)
    const recebida = listarInteracoes(u.usuario_id, db).find((l) => l.tipo === 'despejo_espontaneo')

    assert.equal(recebida.texto, 'antes do áudio\nisto veio de um áudio\ndepois do áudio')
  })

  test('o valor vem da configuração viva', () => {
    cfg.escrever('DEBOUNCE_SEGUNDOS', '7', null, db)
    const { config } = { config: null } // só para deixar claro que a leitura é do repo
    assert.equal(cfg.ler('DEBOUNCE_SEGUNDOS', db), 7)
  })
})
