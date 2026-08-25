import { test, describe } from 'node:test'
import assert from 'node:assert/strict'

/**
 * Smoke test de carregamento dos módulos.
 *
 * Existe por causa de um bug real: `connection.js` importava o Baileys como
 * `import baileys from '...'` e destruturava `useMultiFileAuthState` do default.
 * Na versão instalada (6.7.24) o default É a função makeWASocket, e os demais
 * são named exports — então `useMultiFileAuthState` vinha `undefined` e o
 * container entrava em loop de restart com "is not a function".
 *
 * Nenhum teste importava os entrypoints, então a suíte inteira passava verde
 * enquanto o app não subia. Estes testes fecham essa lacuna: eles não exercitam
 * comportamento, só provam que cada módulo CARREGA e expõe o que promete.
 */

describe('módulos carregam e expõem sua API', () => {
  test('whatsapp/connection.js', async () => {
    const m = await import('../src/whatsapp/connection.js')

    assert.equal(typeof m.conectarWhatsapp, 'function')
    assert.equal(typeof m.extrairMensagem, 'function')
  })

  test('dependências do Baileys resolvem para funções, não undefined', async () => {
    const baileys = await import('@whiskeysockets/baileys')

    // O default é makeWASocket; o resto são named exports.
    assert.equal(typeof baileys.default, 'function', 'default deveria ser makeWASocket')
    assert.equal(typeof baileys.useMultiFileAuthState, 'function')
    assert.equal(typeof baileys.downloadMediaMessage, 'function')
    assert.equal(typeof baileys.DisconnectReason, 'object')
    assert.ok('loggedOut' in baileys.DisconnectReason, 'o motivo de logout precisa existir')
  })

  test('whatsapp/handler.js', async () => {
    const m = await import('../src/whatsapp/handler.js')
    assert.equal(typeof m.tratarMensagemRecebida, 'function')
  })

  test('triggers/scheduler.js', async () => {
    const m = await import('../src/triggers/scheduler.js')

    assert.equal(typeof m.iniciarScheduler, 'function')
    assert.equal(typeof m.dispararGatilhosDoMinuto, 'function')
    assert.equal(typeof m.conciliarSilencios, 'function')
  })

  test('admin/convidarPiloto.js', async () => {
    const m = await import('../src/admin/convidarPiloto.js')
    assert.equal(typeof m.convidarPiloto, 'function')
  })

  test('transcription/transcribe.js', async () => {
    const m = await import('../src/transcription/transcribe.js')
    assert.equal(typeof m.transcreverAudio, 'function')
  })

  test('dashboard/server.js exporta o app sem abrir porta', async () => {
    const m = await import('../src/dashboard/server.js')

    assert.equal(typeof m.renderizar, 'function')
    assert.ok(m.app, 'o app Express precisa ser exportado')
  })
})

describe('configuração', () => {
  test('o host do dashboard é configurável e cai em 127.0.0.1 por padrão', async () => {
    // No Docker isto vira 0.0.0.0: dentro do container o 127.0.0.1 é
    // inalcançável pelo mapeamento de porta. Quem garante o loopback lá é o
    // bind "127.0.0.1:3300:3300" do Compose.
    const anterior = process.env.DASHBOARD_HOST
    delete process.env.DASHBOARD_HOST

    const { config } = await import('../src/config.js')
    assert.equal(config.dashboard.host, anterior ?? '127.0.0.1')

    if (anterior !== undefined) process.env.DASHBOARD_HOST = anterior
  })

  test('o compose publica o dashboard SÓ no loopback do host', async () => {
    const { readFileSync } = await import('node:fs')
    const compose = readFileSync(new URL('../docker-compose.yml', import.meta.url), 'utf8')

    assert.match(compose, /"127\.0\.0\.1:3300:3300"/, 'o bind precisa começar por 127.0.0.1')
    assert.ok(
      !/^\s*-\s*"?3300:3300"?\s*$/m.test(compose),
      'nunca publicar como "3300:3300" — isso exporia dado de saúde na interface pública',
    )
  })
})
