import { test, describe, before, after, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { abrirDb, closeDb } from '../src/db/db.js'
import * as repo from '../src/db/userRepo.js'
import { registrar, listarInteracoes } from '../src/db/interactionLog.js'
import {
  agoraEmSaoPaulo,
  dispararGatilhosDoMinuto,
  conciliarSilencios,
} from '../src/triggers/scheduler.js'
import {
  montarMensagemGatilho,
  mensagemCheckinManha,
  mensagemRemedio,
} from '../src/triggers/messages.js'
import { TIPOS_GATILHO, TIPOS_INTERACAO } from '../src/constants.js'
import { config } from '../src/config.js'

let dir
let db
let enviadas = []
const enviar = async (numero, texto) => {
  enviadas.push({ numero, texto })
}

// 2026-08-25T11:00:00Z = 08:00 em São Paulo (UTC-3).
const AS_8H_SP = new Date('2026-08-25T11:00:00.000Z')

before(() => {
  dir = mkdtempSync(join(tmpdir(), 'tars-sched-'))
  db = abrirDb(join(dir, 'sched.sqlite'))
})

after(() => {
  closeDb()
  rmSync(dir, { recursive: true, force: true })
})

beforeEach(() => {
  db.exec('DELETE FROM historico_interacoes; DELETE FROM contadores; DELETE FROM despejos_semana;')
  db.exec('DELETE FROM gatilhos_configurados; DELETE FROM remedios; DELETE FROM usuarios;')
  enviadas = []
})

function usuarioPronto(numero = '+5511900000001') {
  const u = repo.findOrCreate(numero, db)
  repo.setPersonalidade(u.usuario_id, 'direto', db)
  repo.concluirAnamnese(u.usuario_id, db)
  return repo.findById(u.usuario_id, db)
}

describe('hora de São Paulo calculada explicitamente', () => {
  test('não confia no TZ do processo', () => {
    const { dia, horario } = agoraEmSaoPaulo(AS_8H_SP, 'America/Sao_Paulo')

    assert.equal(horario, '08:00')
    assert.equal(dia, '2026-08-25')
  })

  test('meia-noite sai como 00:00, não 24:00', () => {
    const meiaNoiteSP = new Date('2026-08-25T03:00:00.000Z')
    assert.equal(agoraEmSaoPaulo(meiaNoiteSP, 'America/Sao_Paulo').horario, '00:00')
  })
})

describe('disparo de gatilho', () => {
  test('dispara o checkin_manha às 08:00 e registra no histórico', async () => {
    const u = usuarioPronto()

    const disparados = await dispararGatilhosDoMinuto(enviar, AS_8H_SP)

    assert.equal(disparados.length, 1)
    assert.equal(disparados[0].tipo, TIPOS_GATILHO.CHECKIN_MANHA)
    assert.equal(enviadas.length, 1)
    assert.match(enviadas[0].texto, /modo disfunção/i)

    const registros = listarInteracoes(u.usuario_id, db).filter(
      (i) => i.tipo === TIPOS_INTERACAO.GATILHO_DISPARADO,
    )
    assert.equal(registros.length, 1)
  })

  test('NUNCA dispara o mesmo tipo duas vezes no mesmo dia', async () => {
    usuarioPronto()

    await dispararGatilhosDoMinuto(enviar, AS_8H_SP)
    await dispararGatilhosDoMinuto(enviar, AS_8H_SP)

    assert.equal(enviadas.length, 1, 'o segundo tick do mesmo dia não reenvia')
  })

  test('dispara de novo no dia seguinte', async () => {
    usuarioPronto()

    await dispararGatilhosDoMinuto(enviar, AS_8H_SP)
    const amanha = new Date('2026-08-26T11:00:00.000Z')
    await dispararGatilhosDoMinuto(enviar, amanha)

    assert.equal(enviadas.length, 2)
  })

  test('não dispara fora do horário configurado', async () => {
    usuarioPronto()

    await dispararGatilhosDoMinuto(enviar, new Date('2026-08-25T12:00:00.000Z')) // 09:00 SP

    assert.equal(enviadas.length, 0)
  })

  test('checklist_fim_dia não dispara porque nasce desligado', async () => {
    usuarioPronto()
    const as20hSP = new Date('2026-08-25T23:00:00.000Z')

    await dispararGatilhosDoMinuto(enviar, as20hSP)

    assert.equal(enviadas.length, 0)
  })

  test('usuário em anamnese não recebe disparo', async () => {
    const u = repo.findOrCreate('+5511900000009', db)
    repo.ativarGatilhosPadrao(u.usuario_id, db)
    repo.setAnamneseEstado(u.usuario_id, 5, db)

    await dispararGatilhosDoMinuto(enviar, AS_8H_SP)

    assert.equal(enviadas.length, 0)
  })
})

describe('regra de silêncio — reduz a exigência, nunca aumenta', () => {
  test(`com ${config.silenciosAteReduzirTom} silêncios, a mensagem fica mais curta`, async () => {
    const u = usuarioPronto()

    for (let i = 0; i < config.silenciosAteReduzirTom; i++) {
      repo.incrementarSilencio(u.usuario_id, TIPOS_GATILHO.CHECKIN_MANHA, db)
    }

    const disparados = await dispararGatilhosDoMinuto(enviar, AS_8H_SP)

    assert.equal(disparados[0].reduzido, true)
    assert.equal(enviadas[0].texto, mensagemCheckinManha(true))
    assert.ok(
      mensagemCheckinManha(true).length < mensagemCheckinManha(false).length,
      'a versão reduzida precisa ser MAIS CURTA, não mais insistente',
    )
  })

  test('abaixo do limiar, o tom permanece normal', async () => {
    const u = usuarioPronto()
    repo.incrementarSilencio(u.usuario_id, TIPOS_GATILHO.CHECKIN_MANHA, db)

    const disparados = await dispararGatilhosDoMinuto(enviar, AS_8H_SP)

    assert.equal(disparados[0].reduzido, false)
    assert.equal(enviadas[0].texto, mensagemCheckinManha(false))
  })
})

describe('conciliação de silêncio', () => {
  const janelaMs = config.respostaGatilhoJanelaMin * 60_000

  test('sem resposta depois da janela → registra silêncio e incrementa', async () => {
    const u = usuarioPronto()
    registrar(
      {
        usuarioId: u.usuario_id,
        tipo: TIPOS_INTERACAO.GATILHO_DISPARADO,
        gatilhoRelacionado: TIPOS_GATILHO.CHECKIN_MANHA,
        timestamp: AS_8H_SP.toISOString(),
      },
      db,
    )

    const depoisDaJanela = new Date(AS_8H_SP.getTime() + janelaMs + 60_000)
    const r = await conciliarSilencios(depoisDaJanela)

    assert.equal(r.length, 1)
    assert.equal(r[0].silencios, 1)
    assert.equal(repo.getSilencioConsecutivo(u.usuario_id, TIPOS_GATILHO.CHECKIN_MANHA, db), 1)
  })

  test('dentro da janela ainda não conta como silêncio', async () => {
    const u = usuarioPronto()
    registrar(
      {
        usuarioId: u.usuario_id,
        tipo: TIPOS_INTERACAO.GATILHO_DISPARADO,
        gatilhoRelacionado: TIPOS_GATILHO.CHECKIN_MANHA,
        timestamp: AS_8H_SP.toISOString(),
      },
      db,
    )

    const aindaNaJanela = new Date(AS_8H_SP.getTime() + 30 * 60_000)
    const r = await conciliarSilencios(aindaNaJanela)

    assert.equal(r.length, 0)
    assert.equal(repo.getSilencioConsecutivo(u.usuario_id, TIPOS_GATILHO.CHECKIN_MANHA, db), 0)
  })

  test('o mesmo silêncio não é contado duas vezes', async () => {
    const u = usuarioPronto()
    registrar(
      {
        usuarioId: u.usuario_id,
        tipo: TIPOS_INTERACAO.GATILHO_DISPARADO,
        gatilhoRelacionado: TIPOS_GATILHO.CHECKIN_MANHA,
        timestamp: AS_8H_SP.toISOString(),
      },
      db,
    )

    const depois = new Date(AS_8H_SP.getTime() + janelaMs + 60_000)
    await conciliarSilencios(depois)
    await conciliarSilencios(new Date(depois.getTime() + 5 * 60_000))

    assert.equal(repo.getSilencioConsecutivo(u.usuario_id, TIPOS_GATILHO.CHECKIN_MANHA, db), 1)
  })

  test('resposta registrada impede a contagem de silêncio', async () => {
    const u = usuarioPronto()
    registrar(
      {
        usuarioId: u.usuario_id,
        tipo: TIPOS_INTERACAO.GATILHO_DISPARADO,
        gatilhoRelacionado: TIPOS_GATILHO.CHECKIN_MANHA,
        timestamp: AS_8H_SP.toISOString(),
      },
      db,
    )
    registrar(
      {
        usuarioId: u.usuario_id,
        tipo: TIPOS_INTERACAO.RESPOSTA_GATILHO,
        gatilhoRelacionado: TIPOS_GATILHO.CHECKIN_MANHA,
        timestamp: new Date(AS_8H_SP.getTime() + 10 * 60_000).toISOString(),
      },
      db,
    )

    const depois = new Date(AS_8H_SP.getTime() + janelaMs + 60_000)
    const r = await conciliarSilencios(depois)

    assert.equal(r.length, 0)
    assert.equal(repo.getSilencioConsecutivo(u.usuario_id, TIPOS_GATILHO.CHECKIN_MANHA, db), 0)
  })
})

describe('montarMensagemGatilho', () => {
  test('despacha por tipo', () => {
    assert.equal(
      montarMensagemGatilho(TIPOS_GATILHO.REMEDIO, { nomeRemedio: 'Ritalina' }),
      mensagemRemedio('Ritalina'),
    )
  })

  test('tipo desconhecido falha alto, em vez de mandar mensagem errada', () => {
    assert.throws(() => montarMensagemGatilho('lembrete_agua', {}), /desconhecido/)
  })
})
