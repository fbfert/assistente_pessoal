import { test, describe, before, after, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { abrirDb, closeDb } from '../src/db/db.js'
import * as repo from '../src/db/userRepo.js'
import { registrar } from '../src/db/interactionLog.js'
import { resumoPiloto } from '../src/dashboard/queries.js'
import { renderizar } from '../src/dashboard/server.js'
import { TIPOS_GATILHO, TIPOS_INTERACAO } from '../src/constants.js'
import { config } from '../src/config.js'

let dir
let db

before(() => {
  dir = mkdtempSync(join(tmpdir(), 'tars-dash-'))
  db = abrirDb(join(dir, 'dash.sqlite'))
})

after(() => {
  closeDb()
  rmSync(dir, { recursive: true, force: true })
})

beforeEach(() => {
  db.exec('DELETE FROM historico_interacoes; DELETE FROM contadores; DELETE FROM despejos_semana;')
  db.exec('DELETE FROM gatilhos_configurados; DELETE FROM remedios; DELETE FROM usuarios;')
})

describe('resumoPiloto', () => {
  test('piloto vazio não quebra', () => {
    const r = resumoPiloto(db)

    assert.deepEqual(r.usuarios, [])
    assert.equal(r.totais.convidados, 0)
  })

  test('alerta de sobrecarga acende no limiar configurado', () => {
    const u = repo.findOrCreate('+5511900001111', db)
    repo.salvarCampoAnamnese(u.usuario_id, 'nome', 'Ana', db)
    repo.concluirAnamnese(u.usuario_id, db)

    for (let i = 0; i < config.silenciosAteReduzirTom; i++) {
      repo.incrementarSilencio(u.usuario_id, TIPOS_GATILHO.CHECKIN_MANHA, db)
    }

    const linha = resumoPiloto(db).usuarios[0]

    assert.equal(linha.maiorSilencio, config.silenciosAteReduzirTom)
    assert.equal(linha.alertaSobrecarga, true)
    assert.equal(resumoPiloto(db).totais.emAlerta, 1)
  })

  test('abaixo do limiar não acende', () => {
    const u = repo.findOrCreate('+5511900002222', db)
    repo.concluirAnamnese(u.usuario_id, db)
    repo.incrementarSilencio(u.usuario_id, TIPOS_GATILHO.CHECKIN_MANHA, db)

    assert.equal(resumoPiloto(db).usuarios[0].alertaSobrecarga, false)
  })

  test('taxa de resposta do check-in é calculada, e é nula sem disparo', () => {
    const u = repo.findOrCreate('+5511900003333', db)
    repo.concluirAnamnese(u.usuario_id, db)

    assert.equal(resumoPiloto(db).usuarios[0].taxaResposta, null)

    for (const tipo of [
      TIPOS_INTERACAO.GATILHO_DISPARADO,
      TIPOS_INTERACAO.GATILHO_DISPARADO,
      TIPOS_INTERACAO.RESPOSTA_GATILHO,
    ]) {
      registrar(
        { usuarioId: u.usuario_id, tipo, gatilhoRelacionado: TIPOS_GATILHO.CHECKIN_MANHA },
        db,
      )
    }

    assert.equal(resumoPiloto(db).usuarios[0].taxaResposta, 50)
  })

  test('conta correções reportadas e despejos da semana', () => {
    const u = repo.findOrCreate('+5511900004444', db)
    repo.concluirAnamnese(u.usuario_id, db)
    registrar(
      { usuarioId: u.usuario_id, tipo: TIPOS_INTERACAO.CORRECAO_REPORTADA, texto: 'meu nome é Ana' },
      db,
    )
    repo.incrementarDespejoEspontaneo(u.usuario_id, new Date(), db)
    repo.incrementarDespejoEspontaneo(u.usuario_id, new Date(), db)

    const linha = resumoPiloto(db).usuarios[0]

    assert.equal(linha.correcoes, 1)
    assert.equal(linha.despejosSemana, 2)
  })
})

describe('renderização', () => {
  test('linha em alerta é destacada', () => {
    const u = repo.findOrCreate('+5511900005555', db)
    repo.salvarCampoAnamnese(u.usuario_id, 'nome', 'Ana', db)
    repo.concluirAnamnese(u.usuario_id, db)
    for (let i = 0; i < config.silenciosAteReduzirTom; i++) {
      repo.incrementarSilencio(u.usuario_id, TIPOS_GATILHO.CHECKIN_MANHA, db)
    }

    const html = renderizar(resumoPiloto(db))

    assert.match(html, /<tr class="alerta">/)
    assert.match(html, /SOBRECARGA/)
  })

  test('nome do usuário é escapado — o dashboard mostra texto que a pessoa digitou', () => {
    const u = repo.findOrCreate('+5511900006666', db)
    repo.salvarCampoAnamnese(u.usuario_id, 'nome', '<script>alert(1)</script>', db)

    const html = renderizar(resumoPiloto(db))

    assert.ok(!html.includes('<script>alert(1)</script>'))
    assert.match(html, /&lt;script&gt;/)
  })

  test('piloto vazio renderiza a tabela com aviso, sem quebrar', () => {
    const html = renderizar(resumoPiloto(db))

    assert.match(html, /Nenhum piloto convidado ainda/)
    assert.match(html, /127\.0\.0\.1 apenas/)
  })
})
