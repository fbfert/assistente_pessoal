import baileys from '@whiskeysockets/baileys'
import qrcode from 'qrcode-terminal'
import pino from 'pino'
import { config } from '../config.js'

const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, downloadMediaMessage } =
  baileys

const logger = pino({ level: 'warn' })

/**
 * Conecta ao WhatsApp via Baileys (biblioteca NÃO-OFICIAL).
 *
 * Escolha consciente do piloto: a migração para a API oficial acontece depois
 * da validação. O número precisa ser um chip FÍSICO dedicado, separado do já
 * usado em produção — o WhatsApp rejeita número VoIP no registro.
 *
 * @param {(msg: object) => Promise<void>} aoReceberMensagem
 * @returns {Promise<{sock: object, enviarMensagem: Function, aguardarConexao: Function}>}
 */
export async function conectarWhatsapp(aoReceberMensagem) {
  const { state, saveCreds } = await useMultiFileAuthState(config.auth.dir)

  let resolverConexao
  const conexaoAberta = new Promise((resolve) => {
    resolverConexao = resolve
  })

  const sock = makeWASocket({ auth: state, logger, printQRInTerminal: false })

  sock.ev.on('creds.update', saveCreds)

  sock.ev.on('connection.update', (update) => {
    const { connection, lastDisconnect, qr } = update

    if (qr) {
      console.log('\nEscaneie o QR abaixo com o WhatsApp do chip DEDICADO do piloto:\n')
      qrcode.generate(qr, { small: true })
    }

    if (connection === 'open') {
      console.log('[whatsapp] conectado.')
      resolverConexao(sock)
    }

    if (connection === 'close') {
      const motivo = lastDisconnect?.error?.output?.statusCode

      if (motivo === DisconnectReason.loggedOut) {
        console.error(
          '[whatsapp] sessão encerrada (logout). É preciso parear de novo: ' +
            `apague ${config.auth.dir} e reinicie para gerar um QR novo.`,
        )
        return
      }

      console.warn(`[whatsapp] conexão caiu (${motivo ?? 'motivo desconhecido'}). Reconectando...`)
      conectarWhatsapp(aoReceberMensagem).catch((e) =>
        console.error('[whatsapp] falha ao reconectar:', e?.message ?? e),
      )
    }
  })

  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return

    for (const waMsg of messages) {
      const msg = await extrairMensagem(waMsg, sock)
      if (!msg) continue

      try {
        await aoReceberMensagem(msg)
      } catch (e) {
        console.error('[whatsapp] erro ao tratar mensagem:', e?.message ?? e)
      }
    }
  })

  return {
    sock,
    enviarMensagem: (numero, texto) => enviarPor(sock, numero, texto),
    aguardarConexao: (timeoutMs = 60_000) => comTimeout(conexaoAberta, timeoutMs),
  }
}

/**
 * Normaliza a mensagem do Baileys para a forma que o handler consome.
 * Devolve null para o que deve ser ignorado: grupo, mensagem própria, vazia.
 */
export async function extrairMensagem(waMsg, sock) {
  const jid = waMsg?.key?.remoteJid
  if (!jid) return null
  if (waMsg.key.fromMe) return null
  if (jid.endsWith('@g.us')) return null // grupo

  const conteudo = waMsg.message
  if (!conteudo) return null

  const numero = jid.split('@')[0]

  const audio = conteudo.audioMessage ?? conteudo.pttMessage
  if (audio) {
    const buffer = await downloadMediaMessage(waMsg, 'buffer', {}, { logger, reuploadRequest: sock?.updateMediaMessage })
    return { numero, jid, audio: { buffer, mimeType: audio.mimetype ?? 'audio/ogg' } }
  }

  const texto =
    conteudo.conversation ??
    conteudo.extendedTextMessage?.text ??
    conteudo.imageMessage?.caption ??
    conteudo.videoMessage?.caption ??
    ''

  return texto.trim() ? { numero, jid, texto } : null
}

function enviarPor(sock, numero, texto) {
  const jid = numero.includes('@') ? numero : `${numero.replace(/\D/g, '')}@s.whatsapp.net`
  return sock.sendMessage(jid, { text: texto })
}

function comTimeout(promessa, ms) {
  return Promise.race([
    promessa,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`Timeout de ${ms}ms esperando a conexão abrir`)), ms),
    ),
  ])
}
