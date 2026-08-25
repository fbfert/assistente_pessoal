import { test, describe } from 'node:test'
import assert from 'node:assert/strict'

import { classificarMensagem } from '../src/classify/heuristic.js'
import { TIPOS_INTERACAO } from '../src/constants.js'

const JANELA = 120
const GATILHO = { timestamp: '2026-08-25T08:00:00.000Z' }
const minutosDepois = (n) => new Date(new Date(GATILHO.timestamp).getTime() + n * 60_000)

describe('classificarMensagem', () => {
  test('sem gatilho anterior → despejo espontâneo', () => {
    assert.equal(
      classificarMensagem(new Date(), null, JANELA),
      TIPOS_INTERACAO.DESPEJO_ESPONTANEO,
    )
  })

  test('gatilho sem timestamp → despejo espontâneo', () => {
    assert.equal(
      classificarMensagem(new Date(), {}, JANELA),
      TIPOS_INTERACAO.DESPEJO_ESPONTANEO,
    )
  })

  test('dentro da janela → resposta a gatilho', () => {
    assert.equal(
      classificarMensagem(minutosDepois(30), GATILHO, JANELA),
      TIPOS_INTERACAO.RESPOSTA_GATILHO,
    )
  })

  test('fora da janela → despejo espontâneo', () => {
    assert.equal(
      classificarMensagem(minutosDepois(200), GATILHO, JANELA),
      TIPOS_INTERACAO.DESPEJO_ESPONTANEO,
    )
  })

  test('EXATAMENTE no limite → resposta a gatilho (limite inclusivo)', () => {
    // Decisão documentada em src/classify/heuristic.js: 120 min conta como
    // resposta; 120 min + 1 ms não conta.
    assert.equal(
      classificarMensagem(minutosDepois(120), GATILHO, JANELA),
      TIPOS_INTERACAO.RESPOSTA_GATILHO,
    )

    const umMsDepoisDoLimite = new Date(minutosDepois(120).getTime() + 1)
    assert.equal(
      classificarMensagem(umMsDepoisDoLimite, GATILHO, JANELA),
      TIPOS_INTERACAO.DESPEJO_ESPONTANEO,
    )
  })

  test('duas mensagens na mesma janela contam as duas como resposta', () => {
    // Simplificação aceita: não se distingue 1ª de 2ª mensagem.
    assert.equal(
      classificarMensagem(minutosDepois(5), GATILHO, JANELA),
      TIPOS_INTERACAO.RESPOSTA_GATILHO,
    )
    assert.equal(
      classificarMensagem(minutosDepois(40), GATILHO, JANELA),
      TIPOS_INTERACAO.RESPOSTA_GATILHO,
    )
  })

  test('mensagem anterior ao gatilho não é resposta a ele', () => {
    assert.equal(
      classificarMensagem(minutosDepois(-10), GATILHO, JANELA),
      TIPOS_INTERACAO.DESPEJO_ESPONTANEO,
    )
  })

  test('timestamp inválido não quebra a classificação', () => {
    assert.equal(
      classificarMensagem(new Date(), { timestamp: 'não é data' }, JANELA),
      TIPOS_INTERACAO.DESPEJO_ESPONTANEO,
    )
  })
})
