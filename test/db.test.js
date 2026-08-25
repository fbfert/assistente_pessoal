import { test, describe, before, after, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { abrirDb, closeDb } from '../src/db/db.js'
import {
  SEM_INFORMACAO,
  TIPOS_GATILHO,
  TIPOS_INTERACAO,
  HORARIO_PADRAO_CHECKIN,
  HORARIO_PADRAO_CHECKLIST,
} from '../src/constants.js'
import * as repo from '../src/db/userRepo.js'
import * as log from '../src/db/interactionLog.js'

// Arquivo SQLite temporário real — não mock. O ponto é exercitar os CHECKs,
// as FKs e o upsert de verdade.
let dir
let db

before(() => {
  dir = mkdtempSync(join(tmpdir(), 'tars-test-'))
  db = abrirDb(join(dir, 'teste.sqlite'))
})

after(() => {
  closeDb()
  rmSync(dir, { recursive: true, force: true })
})

beforeEach(() => {
  db.exec('DELETE FROM historico_interacoes; DELETE FROM contadores; DELETE FROM despejos_semana;')
  db.exec('DELETE FROM gatilhos_configurados; DELETE FROM remedios; DELETE FROM usuarios;')
})

describe('usuarios', () => {
  test('findOrCreate é idempotente', () => {
    const a = repo.findOrCreate('+5511999990001', db)
    const b = repo.findOrCreate('+5511999990001', db)

    assert.equal(a.usuario_id, b.usuario_id)
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM usuarios').get().n, 1)
  })

  test('usuário novo começa no estado 0, sem consentimento', () => {
    const u = repo.findOrCreate('+5511999990002', db)

    assert.equal(u.anamnese_estado, 0)
    assert.equal(u.consentimento_aceito, 0)
    assert.equal(u.consentimento_timestamp, null)
  })

  test('personalidade fora dos três valores é rejeitada pelo banco', () => {
    const u = repo.findOrCreate('+5511999990003', db)

    assert.throws(() => repo.setPersonalidade(u.usuario_id, 'sarcastico', db))
  })

  test('salvarCampoAnamnese rejeita campo fora da whitelist', () => {
    const u = repo.findOrCreate('+5511999990004', db)

    assert.throws(
      () => repo.salvarCampoAnamnese(u.usuario_id, 'consentimento_aceito', 1, db),
      /Campo de anamnese desconhecido/,
    )
  })
})

describe('consentimento', () => {
  test('registrar consentimento grava aceite, versão e timestamp', () => {
    const u = repo.findOrCreate('+5511999990010', db)
    const depois = repo.registrarConsentimento(u.usuario_id, 'v1', db)

    assert.equal(depois.consentimento_aceito, 1)
    assert.equal(depois.consentimento_versao, 'v1')
    assert.ok(depois.consentimento_timestamp, 'timestamp do aceite precisa existir')
  })

  test('transição de estado zera o flag de segunda chance', () => {
    const u = repo.findOrCreate('+5511999990011', db)
    repo.marcarExemploPedido(u.usuario_id, db)
    assert.equal(repo.findById(u.usuario_id, db).anamnese_exemplo_pedido, 1)

    const depois = repo.setAnamneseEstado(u.usuario_id, 2, db)

    assert.equal(depois.anamnese_estado, 2)
    assert.equal(depois.anamnese_exemplo_pedido, 0)
  })
})

describe('remédios e Regra 1b', () => {
  test("campo vazio vira o sentinela 'sem informação', nunca um chute", () => {
    const u = repo.findOrCreate('+5511999990020', db)
    const r = repo.adicionarRemedio(u.usuario_id, 'Ritalina', '', db)

    assert.equal(r.nome, 'Ritalina')
    assert.equal(r.horario, SEM_INFORMACAO)
  })

  test('o sentinela tem acento e cedilha — byte a byte', () => {
    // Este teste é o que pega o bug de acentuação se ele reaparecer: um
    // 'sem informacao' sem acento passaria despercebido no filtro `!==`
    // de ativarGatilhosPadrao e criaria gatilho para remédio inexistente.
    assert.equal(SEM_INFORMACAO, 'sem informação')
    assert.equal([...SEM_INFORMACAO].length, 14)
  })

  test('remédio sem horário NÃO vira gatilho', () => {
    const u = repo.findOrCreate('+5511999990021', db)
    repo.adicionarRemedio(u.usuario_id, 'Ritalina', SEM_INFORMACAO, db)
    repo.ativarGatilhosPadrao(u.usuario_id, db)

    const deRemedio = repo
      .listarGatilhosUsuario(u.usuario_id, db)
      .filter((g) => g.tipo === TIPOS_GATILHO.REMEDIO)

    assert.equal(deRemedio.length, 0)
  })

  test('remédio sem nome NÃO vira gatilho', () => {
    const u = repo.findOrCreate('+5511999990022', db)
    repo.adicionarRemedio(u.usuario_id, SEM_INFORMACAO, '09:00', db)
    repo.ativarGatilhosPadrao(u.usuario_id, db)

    const deRemedio = repo
      .listarGatilhosUsuario(u.usuario_id, db)
      .filter((g) => g.tipo === TIPOS_GATILHO.REMEDIO)

    assert.equal(deRemedio.length, 0)
  })

  test('remédio completo vira gatilho no horário informado', () => {
    const u = repo.findOrCreate('+5511999990023', db)
    repo.adicionarRemedio(u.usuario_id, 'Ritalina', '09:30', db)
    repo.ativarGatilhosPadrao(u.usuario_id, db)

    const deRemedio = repo
      .listarGatilhosUsuario(u.usuario_id, db)
      .filter((g) => g.tipo === TIPOS_GATILHO.REMEDIO)

    assert.equal(deRemedio.length, 1)
    assert.equal(deRemedio[0].horario, '09:30')
  })
})

describe('gatilhos padrão', () => {
  test('checkin_manha às 08:00 ativo; checklist_fim_dia às 20:00 DESLIGADO', () => {
    const u = repo.findOrCreate('+5511999990030', db)
    repo.ativarGatilhosPadrao(u.usuario_id, db)

    const gatilhos = repo.listarGatilhosUsuario(u.usuario_id, db)
    const checkin = gatilhos.find((g) => g.tipo === TIPOS_GATILHO.CHECKIN_MANHA)
    const checklist = gatilhos.find((g) => g.tipo === TIPOS_GATILHO.CHECKLIST_FIM_DIA)

    assert.equal(checkin.horario, HORARIO_PADRAO_CHECKIN)
    assert.equal(checkin.ativo, 1)
    assert.equal(checklist.horario, HORARIO_PADRAO_CHECKLIST)
    assert.equal(checklist.ativo, 0, 'checklist_fim_dia nasce desligado no MVP')
  })

  test('listarGatilhosAtivos ignora usuário com anamnese em andamento', () => {
    const emAndamento = repo.findOrCreate('+5511999990031', db)
    repo.ativarGatilhosPadrao(emAndamento.usuario_id, db)
    repo.setAnamneseEstado(emAndamento.usuario_id, 5, db)

    const concluido = repo.findOrCreate('+5511999990032', db)
    repo.concluirAnamnese(concluido.usuario_id, db)

    const ativos = log_ids(repo.listarGatilhosAtivos(db))

    assert.ok(!ativos.includes(emAndamento.usuario_id))
    assert.ok(ativos.includes(concluido.usuario_id))
  })

  const log_ids = (linhas) => [...new Set(linhas.map((l) => l.usuario_id))]

  test('tipo de gatilho desconhecido é rejeitado pelo banco', () => {
    const u = repo.findOrCreate('+5511999990033', db)

    assert.throws(() => repo.configurarGatilho(u.usuario_id, 'lembrete_agua', '10:00', 1, null, db))
  })
})

describe('contador de silêncio', () => {
  test('incrementa, acumula e zera', () => {
    const u = repo.findOrCreate('+5511999990040', db)
    const tipo = TIPOS_GATILHO.CHECKIN_MANHA

    assert.equal(repo.getSilencioConsecutivo(u.usuario_id, tipo, db), 0)
    assert.equal(repo.incrementarSilencio(u.usuario_id, tipo, db), 1)
    assert.equal(repo.incrementarSilencio(u.usuario_id, tipo, db), 2)
    assert.equal(repo.incrementarSilencio(u.usuario_id, tipo, db), 3)

    repo.zerarSilencio(u.usuario_id, tipo, db)

    assert.equal(repo.getSilencioConsecutivo(u.usuario_id, tipo, db), 0)
  })

  test('contadores são independentes por tipo de gatilho', () => {
    const u = repo.findOrCreate('+5511999990041', db)
    repo.incrementarSilencio(u.usuario_id, TIPOS_GATILHO.CHECKIN_MANHA, db)
    repo.incrementarSilencio(u.usuario_id, TIPOS_GATILHO.CHECKIN_MANHA, db)
    repo.incrementarSilencio(u.usuario_id, TIPOS_GATILHO.REMEDIO, db)

    assert.equal(repo.getSilencioConsecutivo(u.usuario_id, TIPOS_GATILHO.CHECKIN_MANHA, db), 2)
    assert.equal(repo.getSilencioConsecutivo(u.usuario_id, TIPOS_GATILHO.REMEDIO, db), 1)
  })
})

describe('histórico de interações', () => {
  test('registra e recupera o último gatilho disparado', () => {
    const u = repo.findOrCreate('+5511999990050', db)

    log.registrar(
      {
        usuarioId: u.usuario_id,
        tipo: TIPOS_INTERACAO.GATILHO_DISPARADO,
        texto: 'bom dia',
        gatilhoRelacionado: TIPOS_GATILHO.CHECKIN_MANHA,
        timestamp: '2026-08-25T08:00:00.000Z',
      },
      db,
    )
    log.registrar(
      {
        usuarioId: u.usuario_id,
        tipo: TIPOS_INTERACAO.GATILHO_DISPARADO,
        texto: 'remédio',
        gatilhoRelacionado: TIPOS_GATILHO.REMEDIO,
        timestamp: '2026-08-25T09:30:00.000Z',
      },
      db,
    )

    const ultimo = log.ultimoGatilhoDisparado(u.usuario_id, db)

    assert.equal(ultimo.gatilho_relacionado, TIPOS_GATILHO.REMEDIO)
    assert.equal(ultimo.timestamp, '2026-08-25T09:30:00.000Z')
  })

  test('jaDisparouHoje distingue o dia', () => {
    const u = repo.findOrCreate('+5511999990051', db)
    log.registrar(
      {
        usuarioId: u.usuario_id,
        tipo: TIPOS_INTERACAO.GATILHO_DISPARADO,
        gatilhoRelacionado: TIPOS_GATILHO.CHECKIN_MANHA,
        timestamp: '2026-08-25T08:00:00.000Z',
      },
      db,
    )

    assert.equal(log.jaDisparouHoje(u.usuario_id, TIPOS_GATILHO.CHECKIN_MANHA, '2026-08-25', db), true)
    assert.equal(log.jaDisparouHoje(u.usuario_id, TIPOS_GATILHO.CHECKIN_MANHA, '2026-08-26', db), false)
  })

  test('tipo de interação desconhecido é rejeitado pelo banco', () => {
    const u = repo.findOrCreate('+5511999990052', db)

    assert.throws(() =>
      log.registrar({ usuarioId: u.usuario_id, tipo: 'reclamacao', texto: 'x' }, db),
    )
  })

  test('houveRespostaOuSilencioApos enxerga resposta e silêncio', () => {
    const u = repo.findOrCreate('+5511999990053', db)
    const disparo = '2026-08-25T08:00:00.000Z'

    assert.equal(
      log.houveRespostaOuSilencioApos(u.usuario_id, TIPOS_GATILHO.CHECKIN_MANHA, disparo, db),
      false,
    )

    log.registrar(
      {
        usuarioId: u.usuario_id,
        tipo: TIPOS_INTERACAO.RESPOSTA_GATILHO,
        gatilhoRelacionado: TIPOS_GATILHO.CHECKIN_MANHA,
        timestamp: '2026-08-25T08:20:00.000Z',
      },
      db,
    )

    assert.equal(
      log.houveRespostaOuSilencioApos(u.usuario_id, TIPOS_GATILHO.CHECKIN_MANHA, disparo, db),
      true,
    )
  })
})

describe('contador semanal de despejo', () => {
  test('acumula dentro da mesma semana', () => {
    const u = repo.findOrCreate('+5511999990060', db)
    const terca = new Date('2026-08-25T12:00:00.000Z')

    assert.equal(repo.incrementarDespejoEspontaneo(u.usuario_id, terca, db), 1)
    assert.equal(repo.incrementarDespejoEspontaneo(u.usuario_id, terca, db), 2)
    assert.equal(repo.getDespejosSemana(u.usuario_id, db).contagem, 2)
  })

  test('reseta na virada de semana em vez de somar sobre a anterior', () => {
    const u = repo.findOrCreate('+5511999990061', db)
    const terca = new Date('2026-08-25T12:00:00.000Z')
    const segundaSeguinte = new Date('2026-08-31T09:00:00.000Z')

    repo.incrementarDespejoEspontaneo(u.usuario_id, terca, db)
    repo.incrementarDespejoEspontaneo(u.usuario_id, terca, db)

    assert.equal(repo.incrementarDespejoEspontaneo(u.usuario_id, segundaSeguinte, db), 1)
    assert.equal(repo.getDespejosSemana(u.usuario_id, db).semana_inicio, '2026-08-31')
  })

  test('a semana abre na segunda-feira', () => {
    // 2026-08-25 é uma terça; 2026-08-30 é o domingo da MESMA semana.
    assert.equal(repo.inicioDaSemana(new Date('2026-08-25T00:00:00.000Z')), '2026-08-24')
    assert.equal(repo.inicioDaSemana(new Date('2026-08-30T00:00:00.000Z')), '2026-08-24')
    assert.equal(repo.inicioDaSemana(new Date('2026-08-31T00:00:00.000Z')), '2026-08-31')
  })
})
