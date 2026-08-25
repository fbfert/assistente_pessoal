#!/usr/bin/env node
/**
 * Convida uma pessoa para o piloto.
 *
 *   node scripts/convidar-piloto.js +5511999999999
 *   docker compose exec tars node scripts/convidar-piloto.js +5511999999999
 *
 * Conecta ao WhatsApp, espera a conexão abrir (timeout de 60s), manda o texto
 * de consentimento e sai. A partir daí a conversa segue pelo processo principal.
 */
import { getDb, closeDb } from '../src/db/db.js'
import { conectarWhatsapp } from '../src/whatsapp/connection.js'
import { convidarPiloto } from '../src/admin/convidarPiloto.js'

const numero = process.argv[2]

if (!numero) {
  console.error('Uso: node scripts/convidar-piloto.js +5511999999999')
  process.exit(1)
}

if (!/^\+?\d{10,15}$/.test(numero.replace(/[\s()-]/g, ''))) {
  console.error(`Número não parece válido: "${numero}". Use o formato +5511999999999.`)
  process.exit(1)
}

try {
  getDb()

  // O convite não responde mensagem — só envia. O listener fica ocioso.
  const conexao = await conectarWhatsapp(async () => {})

  console.log('[convite] esperando a conexão abrir (até 60s)...')
  await conexao.aguardarConexao(60_000)

  const usuario = await convidarPiloto(numero, conexao.enviarMensagem)

  console.log(`[convite] enviado para ${numero} (usuario_id ${usuario.usuario_id}).`)
  console.log('[convite] a próxima mensagem dessa pessoa já é a resposta ao consentimento.')

  await conexao.sock.end()
  closeDb()
  process.exit(0)
} catch (e) {
  console.error('[convite] falhou:', e?.message ?? e)
  closeDb()
  process.exit(1)
}
