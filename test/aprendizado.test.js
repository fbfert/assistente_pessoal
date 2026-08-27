import { test, describe, before, after, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { abrirDb, closeDb } from '../src/db/db.js'
import * as repo from '../src/db/userRepo.js'
import * as notasRepo from '../src/db/notasRepo.js'
import { listarInteracoes } from '../src/db/interactionLog.js'
import { processarMensagem } from '../src/conversa/nucleo.js'
import { parsearAprendizado } from '../src/anamnese/aprenderPerfil.js'
import { montarSystemPrompt, montarContextoAnamnese } from '../src/llm/prompts.js'
import { ESTADOS } from '../src/anamnese/questions.js'
import { CANAIS, REDIGIDO, SEM_INFORMACAO, TIPOS_INTERACAO } from '../src/constants.js'

/**
 * Aprendizado contínuo: o perfil acumula depois do dia 1.
 *
 * O extrator é mockado em todos os casos — o que se testa aqui é o que o sistema
 * FAZ com a resposta dele, incluindo recusar a resposta errada.
 */

let dir, db
const NUMERO = '+5511900005555'
let respostas = []
const responder = async (t) => {
  respostas.push(t)
}

const llmFalso = async () => 'resposta do modelo'
const naoAprende = async () => ({ aprendeu: false, campo: null, texto: null })
const aprende = (campo, texto) => async () => ({ aprendeu: true, campo, texto })

before(() => {
  dir = mkdtempSync(join(tmpdir(), 'tars-aprend-'))
  db = abrirDb(join(dir, 'aprend.sqlite'))
})

after(() => {
  closeDb()
  rmSync(dir, { recursive: true, force: true })
})

beforeEach(() => {
  db.exec(
    'DELETE FROM notas_aprendidas; DELETE FROM historico_interacoes; DELETE FROM remedios; DELETE FROM usuarios;',
  )
  respostas = []
})

function participante(campos = {}) {
  const u = repo.findOrCreate(NUMERO, db)
  repo.setAnamneseEstado(u.usuario_id, ESTADOS.CONCLUIDO, db)
  for (const [campo, valor] of Object.entries(campos)) {
    repo.salvarCampoAnamnese(u.usuario_id, campo, valor, db)
  }
  return repo.findById(u.usuario_id, db)
}

const processar = (u, texto, deps = {}) =>
  processarMensagem(
    { usuario: u, texto, canal: CANAIS.WEB, responder },
    { db, chamar: llmFalso, aprender: naoAprende, ...deps },
  )

// =============================================================================

describe('captura conservadora', () => {
  test('fato claro e recorrente vira nota', async () => {
    const u = participante({ gatilhos_de_sobrecarga: 'prazo apertado' })

    const r = await processar(u, 'barulho de obra sempre me derruba a semana inteira', {
      aprender: aprende('gatilhos_de_sobrecarga', 'barulho de obra derruba a semana inteira'),
    })

    assert.equal(r.aprendeu, true)
    const notas = notasRepo.listarNotasAtivas(u.usuario_id, db)
    assert.equal(notas.length, 1)
    assert.equal(notas[0].campo, 'gatilhos_de_sobrecarga')
    assert.equal(notas[0].texto, 'barulho de obra derruba a semana inteira')
  })

  test('queixa pontual não vira nota', async () => {
    const u = participante()

    // O extrator, com o prompt conservador, recusa este caso.
    const r = await processar(u, 'hoje o trânsito me deixou louco', { aprender: naoAprende })

    assert.equal(r.aprendeu, false)
    assert.equal(notasRepo.listarNotasAtivas(u.usuario_id, db).length, 0)
  })

  test('a resposta original da anamnese nunca é sobrescrita', async () => {
    const u = participante({ gatilhos_de_sobrecarga: 'prazo apertado' })

    await processar(u, 'barulho de obra sempre me derruba', {
      aprender: aprende('gatilhos_de_sobrecarga', 'barulho de obra'),
    })

    assert.equal(
      repo.findById(u.usuario_id, db).gatilhos_de_sobrecarga,
      'prazo apertado',
      'o que ela respondeu sob consentimento é fato imutável',
    )
  })

  test('a nota aponta para a mensagem de origem, sem copiá-la', async () => {
    const u = participante()

    await processar(u, 'me incomoda muito quando mudam meu horário, e outra coisa privada aqui', {
      aprender: aprende('gatilhos_de_sobrecarga', 'mudança de horário'),
    })

    const nota = notasRepo.listarNotasAtivas(u.usuario_id, db)[0]
    assert.ok(nota.interacao_id, 'a rastreabilidade é por referência')
    assert.ok(!nota.texto.includes('outra coisa privada'), 'a mensagem inteira não é copiada')
  })
})

describe('o que o extrator não pode fazer', () => {
  test('campo fora da whitelist é recusado no parse', () => {
    for (const campo of ['nome', 'remedio', 'inventado', 'personalidade']) {
      const r = parsearAprendizado(JSON.stringify({ aprendeu: true, campo, texto: 'x' }))
      assert.equal(r.aprendeu, false, campo)
    }
  })

  test('mensagem sobre remédio não vira nota por este caminho', async () => {
    const u = participante()
    repo.adicionarRemedio(u.usuario_id, 'Bup', SEM_INFORMACAO, db)

    // Mesmo que o modelo tentasse, o campo `remedio` não existe na whitelist —
    // e o parse o recusa antes de qualquer gravação.
    const r = await processar(u, 'tomo bup todo dia de manhã', {
      aprender: async (mensagem) =>
        parsearAprendizado(
          JSON.stringify({ aprendeu: true, campo: 'remedio', texto: mensagem }),
        ),
      extrair: async () => [],
    })

    assert.equal(r.aprendeu, false)
    assert.equal(notasRepo.listarNotasAtivas(u.usuario_id, db).length, 0)
  })

  test('nota vazia é recusada', () => {
    assert.equal(
      parsearAprendizado('{"aprendeu":true,"campo":"nunca_fazer","texto":"   "}').aprendeu,
      false,
    )
  })
})

describe('falha nunca alcança a pessoa', () => {
  test('extrator que lança não impede a resposta normal', async () => {
    const u = participante()

    const r = await processar(u, 'oi', {
      aprender: async () => {
        throw new Error('provedor fora')
      },
    })

    assert.equal(r.respondeu, true)
    assert.deepEqual(respostas, ['resposta do modelo'])
    assert.equal(notasRepo.listarNotasAtivas(u.usuario_id, db).length, 0)
  })

  test('resposta malformada do extrator vira "não aprendeu nada"', async () => {
    const u = participante()

    const r = await processar(u, 'oi', { aprender: async () => parsearAprendizado('lixo') })

    assert.equal(r.aprendeu, false)
    assert.deepEqual(respostas, ['resposta do modelo'])
  })

  test('o aprendizado não envia mensagem nenhuma', async () => {
    const u = participante()

    await processar(u, 'sempre me perco em tarefa longa', {
      aprender: aprende('o_que_trava', 'tarefa longa'),
    })

    assert.deepEqual(respostas, ['resposta do modelo'], 'nada além da resposta normal')
  })
})

describe('auditoria', () => {
  test('a criação registra campo e texto, não a mensagem inteira', async () => {
    const u = participante()

    await processar(u, 'sempre travo em reunião longa, e detalhe sensível não relacionado', {
      aprender: aprende('o_que_trava', 'reunião longa'),
    })

    const linha = listarInteracoes(u.usuario_id, db).find(
      (l) => l.tipo === TIPOS_INTERACAO.APRENDIZADO_PERFIL,
    )
    assert.ok(linha)
    assert.match(linha.texto, /o_que_trava/)
    assert.match(linha.texto, /reunião longa/)
    assert.ok(!linha.texto.includes('detalhe sensível'))
    assert.equal(linha.canal, CANAIS.WEB)
  })
})

describe('nota no contexto do assistente', () => {
  test('entra com rótulo distinto da resposta original', () => {
    const contexto = montarContextoAnamnese(
      { o_que_trava: 'começar as coisas' },
      [],
      { o_que_trava: [{ texto: 'reunião longa', criado_em: '2026-09-12T10:00:00Z' }] },
    )

    assert.match(contexto, /começar as coisas \| Notas aprendidas depois: reunião longa \(12\/09\)/)
  })

  test('nota removida some do contexto, mas continua no banco', async () => {
    const u = participante({ o_que_trava: 'começar as coisas' })
    await processar(u, 'sempre travo em reunião longa', {
      aprender: aprende('o_que_trava', 'reunião longa'),
    })

    const nota = notasRepo.listarNotasAtivas(u.usuario_id, db)[0]
    const antes = montarSystemPrompt(u, [], notasRepo.notasAtivasPorCampo(u.usuario_id, db))
    assert.match(antes, /reunião longa/)

    notasRepo.removerNota(nota.nota_id, null, db)

    const depois = montarSystemPrompt(u, [], notasRepo.notasAtivasPorCampo(u.usuario_id, db))
    assert.ok(!depois.includes('reunião longa'), 'saiu do contexto')

    const noBanco = notasRepo.buscarNota(nota.nota_id, db)
    assert.ok(noBanco, 'soft delete: a linha continua')
    assert.ok(noBanco.removido_em, 'com quando')
  })

  test('participante sem nota recebe exatamente o contexto de antes', () => {
    const u = { nome: 'Ana', o_que_trava: 'x' }

    assert.equal(montarContextoAnamnese(u, []), montarContextoAnamnese(u, [], {}))
    assert.ok(!montarContextoAnamnese(u, []).includes('Notas aprendidas'))
  })
})

describe('ciclo de vida da nota', () => {
  test('reiniciar a anamnese apaga as notas, e o histórico fica', async () => {
    const u = participante()
    await processar(u, 'sempre travo em reunião longa', {
      aprender: aprende('o_que_trava', 'reunião longa'),
    })
    const interacoesAntes = listarInteracoes(u.usuario_id, db).length

    repo.reiniciarAnamnese(u.usuario_id, db)

    assert.equal(notasRepo.listarTodasAsNotas(u.usuario_id, db).length, 0)
    assert.equal(listarInteracoes(u.usuario_id, db).length, interacoesAntes, 'histórico intacto')
  })

  test('anonimizar redige o texto das notas, inclusive das removidas', async () => {
    const u = participante()
    await processar(u, 'sempre travo em reunião longa', {
      aprender: aprende('o_que_trava', 'reunião longa'),
    })
    const nota = notasRepo.listarNotasAtivas(u.usuario_id, db)[0]
    notasRepo.removerNota(nota.nota_id, null, db)

    repo.anonimizarParticipante(u.usuario_id, db)

    for (const n of notasRepo.listarTodasAsNotas(u.usuario_id, db)) {
      assert.equal(n.texto, REDIGIDO)
    }
  })

  test('campo não aprendível é recusado antes do banco', () => {
    const u = participante()
    assert.throws(
      () => notasRepo.criarNota({ usuarioId: u.usuario_id, campo: 'nome', texto: 'Ana' }, db),
      /não aprendível/,
    )
  })
})
