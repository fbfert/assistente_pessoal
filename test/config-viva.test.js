import { test, describe, before, after, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { abrirDb, closeDb } from '../src/db/db.js'
import * as cfg from '../src/db/configRepo.js'
import { listarAuditoriaAdmin } from '../src/db/auditoriaAdminRepo.js'
import { config } from '../src/config.js'
import { HORARIO_PADRAO_CHECKIN } from '../src/constants.js'

/**
 * Configuração viva: os números que o piloto existe para calibrar, editáveis sem
 * deploy — com histórico e caminho de volta.
 */

let dir, db

before(() => {
  dir = mkdtempSync(join(tmpdir(), 'tars-cfg-'))
  db = abrirDb(join(dir, 'cfg.sqlite'))
})

after(() => {
  closeDb()
  rmSync(dir, { recursive: true, force: true })
})

beforeEach(() => {
  db.exec('DELETE FROM config_global; DELETE FROM config_historico; DELETE FROM auditoria_admin;')
  cfg.invalidar()
})

describe('ordem de leitura em três degraus', () => {
  test('sem banco e sem ambiente, vale a constante do código', () => {
    // Os horários de gatilho nunca tiveram variável de ambiente.
    assert.equal(cfg.ler('HORARIO_PADRAO_CHECKIN', db), HORARIO_PADRAO_CHECKIN)
    assert.equal(cfg.origem('HORARIO_PADRAO_CHECKIN', db), 'codigo')
  })

  test('o ambiente é o segundo degrau, para quem tem variável', () => {
    const antes = process.env.SILENCIOS_ATE_REDUZIR_TOM
    process.env.SILENCIOS_ATE_REDUZIR_TOM = '7'
    cfg.invalidar()

    assert.equal(cfg.ler('SILENCIOS_ATE_REDUZIR_TOM', db), 7)
    assert.equal(cfg.origem('SILENCIOS_ATE_REDUZIR_TOM', db), 'ambiente')

    process.env.SILENCIOS_ATE_REDUZIR_TOM = antes
  })

  test('o banco tem precedência sobre o ambiente', () => {
    const antes = process.env.SILENCIOS_ATE_REDUZIR_TOM
    process.env.SILENCIOS_ATE_REDUZIR_TOM = '7'

    cfg.escrever('SILENCIOS_ATE_REDUZIR_TOM', '4', null, db)

    assert.equal(cfg.ler('SILENCIOS_ATE_REDUZIR_TOM', db), 4)
    assert.equal(cfg.origem('SILENCIOS_ATE_REDUZIR_TOM', db), 'banco')

    process.env.SILENCIOS_ATE_REDUZIR_TOM = antes
  })

  test('ambiente com lixo não derruba nada: cai para a constante', () => {
    const antes = process.env.RESPOSTA_GATILHO_JANELA_MIN
    process.env.RESPOSTA_GATILHO_JANELA_MIN = 'meia hora'
    cfg.invalidar()

    assert.equal(cfg.ler('RESPOSTA_GATILHO_JANELA_MIN', db), 120)

    process.env.RESPOSTA_GATILHO_JANELA_MIN = antes
  })

  test('o app enxerga o valor novo sem reiniciar', () => {
    cfg.escrever('RESPOSTA_GATILHO_JANELA_MIN', '45', null, db)

    // `config` é lido por getter — é o que faz a edição alcançar o processo do bot.
    assert.equal(config.respostaGatilhoJanelaMin, 45)
  })

  test('número devolve número, horário devolve texto', () => {
    assert.equal(typeof cfg.ler('SILENCIOS_ATE_REDUZIR_TOM', db), 'number')
    assert.equal(typeof cfg.ler('HORARIO_PADRAO_CHECKIN', db), 'string')
  })
})

describe('validação antes de aceitar', () => {
  test('número fora da faixa é recusado, e o valor anterior permanece', () => {
    cfg.escrever('SILENCIOS_ATE_REDUZIR_TOM', '5', null, db)

    assert.throws(() => cfg.escrever('SILENCIOS_ATE_REDUZIR_TOM', '-1', null, db), /entre/)
    assert.throws(() => cfg.escrever('SILENCIOS_ATE_REDUZIR_TOM', '999', null, db), /entre/)

    assert.equal(cfg.ler('SILENCIOS_ATE_REDUZIR_TOM', db), 5, 'nada foi alterado')
  })

  test('horário malformado é recusado', () => {
    for (const ruim of ['8:00', '25:00', '08:60', 'manhã', '0800']) {
      assert.throws(() => cfg.escrever('HORARIO_PADRAO_CHECKIN', ruim, null, db), /HH:MM/, ruim)
    }
    assert.equal(cfg.ler('HORARIO_PADRAO_CHECKIN', db), HORARIO_PADRAO_CHECKIN)
  })

  test('número quebrado é recusado', () => {
    assert.throws(() => cfg.escrever('SILENCIOS_ATE_REDUZIR_TOM', '3.5', null, db), /inteiro/)
  })

  test('chave desconhecida é recusada', () => {
    assert.throws(() => cfg.escrever('ANTHROPIC_API_KEY', 'sk-abc', null, db), /desconhecida/)
    assert.throws(() => cfg.ler('QUALQUER_COISA', db), /desconhecida/)
  })

  test('a lista de chaves não contém credencial nem provedor ativo', () => {
    const chaves = Object.keys(cfg.CHAVES).join(' ')

    for (const proibida of ['API_KEY', 'LLM_PROVIDER', 'PROVIDER']) {
      assert.ok(!chaves.includes(proibida), `${proibida} não pode ser configuração viva`)
    }
  })
})

describe('histórico e reversão', () => {
  test('a escrita guarda o valor ANTERIOR, mesmo vindo do código', () => {
    cfg.escrever('HORARIO_PADRAO_CHECKIN', '09:30', null, db)

    const h = cfg.historico('HORARIO_PADRAO_CHECKIN', 10, db)
    assert.equal(h.length, 1)
    assert.equal(h[0].valor_antigo, HORARIO_PADRAO_CHECKIN, 'de onde partiu importa para reverter')
  })

  test('reverter é uma escrita nova: restaura e NÃO apaga rastro', () => {
    cfg.escrever('HORARIO_PADRAO_CHECKIN', '09:00', null, db)
    cfg.escrever('HORARIO_PADRAO_CHECKIN', '10:00', null, db)

    const antesDaReversao = cfg.historico('HORARIO_PADRAO_CHECKIN', 10, db)
    assert.equal(antesDaReversao.length, 2)

    // Volta ao ponto em que o valor anterior era 09:00.
    cfg.reverter(antesDaReversao[0].historico_id, null, db)

    assert.equal(cfg.ler('HORARIO_PADRAO_CHECKIN', db), '09:00')

    const depois = cfg.historico('HORARIO_PADRAO_CHECKIN', 10, db)
    assert.equal(depois.length, 3, 'a reversão acrescenta, não substitui')
    assert.equal(depois.at(-1).valor_antigo, HORARIO_PADRAO_CHECKIN, 'a linha mais antiga ficou')
  })

  test('restaurar padrão volta à constante, e também vira histórico', () => {
    cfg.escrever('HORARIO_PADRAO_CHECKIN', '11:11', null, db)

    cfg.restaurarPadrao('HORARIO_PADRAO_CHECKIN', null, db)

    assert.equal(cfg.ler('HORARIO_PADRAO_CHECKIN', db), HORARIO_PADRAO_CHECKIN)
    assert.equal(cfg.historico('HORARIO_PADRAO_CHECKIN', 10, db).length, 2)
  })

  test('reverter ponto inexistente falha sem alterar nada', () => {
    cfg.escrever('SILENCIOS_ATE_REDUZIR_TOM', '5', null, db)
    assert.throws(() => cfg.reverter(9999, null, db), /não encontrado/)
    assert.equal(cfg.ler('SILENCIOS_ATE_REDUZIR_TOM', db), 5)
  })
})

describe('auditoria', () => {
  test('toda escrita vira linha de auditoria da EQUIPE, com os dois valores', () => {
    cfg.escrever('SILENCIOS_ATE_REDUZIR_TOM', '6', null, db)

    const linha = listarAuditoriaAdmin(10, db).find((l) => l.acao === 'configurou_sistema')
    assert.ok(linha, 'a ação precisa ser registrável — exige o valor no CHECK')
    assert.match(linha.descricao, /SILENCIOS_ATE_REDUZIR_TOM/)
    assert.match(linha.descricao, /"3" → "6"/)
  })

  test('a reversão também é auditada', () => {
    cfg.escrever('SILENCIOS_ATE_REDUZIR_TOM', '6', null, db)
    const h = cfg.historico('SILENCIOS_ATE_REDUZIR_TOM', 10, db)
    cfg.reverter(h[0].historico_id, null, db)

    assert.equal(
      listarAuditoriaAdmin(10, db).filter((l) => l.acao === 'configurou_sistema').length,
      2,
    )
  })

  test('escrita recusada não deixa auditoria nem histórico', () => {
    assert.throws(() => cfg.escrever('SILENCIOS_ATE_REDUZIR_TOM', '-5', null, db))

    assert.equal(listarAuditoriaAdmin(10, db).length, 0)
    assert.equal(cfg.historico('SILENCIOS_ATE_REDUZIR_TOM', 10, db).length, 0)
  })
})

describe('leitura entre processos', () => {
  test('escrita de outro processo é vista sem reiniciar', () => {
    assert.equal(cfg.ler('DEBOUNCE_SEGUNDOS', db), 0)

    // Simula o container do admin gravando direto no banco compartilhado.
    db.prepare(
      `INSERT INTO config_global (chave, valor, tipo, atualizado_em)
            VALUES ('DEBOUNCE_SEGUNDOS', '8', 'numero', ?)`,
    ).run(new Date(Date.now() + 1000).toISOString())

    assert.equal(cfg.ler('DEBOUNCE_SEGUNDOS', db), 8, 'o cache precisa perceber a mudança')
  })
})

describe('panorama para a interface', () => {
  test('listarTudo diz valor, origem e padrão de cada chave', () => {
    cfg.escrever('DEBOUNCE_SEGUNDOS', '5', null, db)
    const tudo = cfg.listarTudo(db)

    const debounce = tudo.find((c) => c.chave === 'DEBOUNCE_SEGUNDOS')
    assert.equal(debounce.valor, 5)
    assert.equal(debounce.origem, 'banco')
    assert.equal(debounce.padrao, 0)
    assert.ok(debounce.rotulo)

    assert.ok(tudo.every((c) => c.tipo && c.chave))
  })
})
