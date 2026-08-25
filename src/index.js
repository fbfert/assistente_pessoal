import { getDb } from './db/db.js'
import { conectarWhatsapp } from './whatsapp/connection.js'
import { tratarMensagemRecebida } from './whatsapp/handler.js'
import { iniciarScheduler } from './triggers/scheduler.js'
import { config } from './config.js'

async function main() {
  getDb()
  console.log(`[tars] banco em ${config.db.path}`)

  // Declarado antes da conexão: o listener de mensagens é registrado dentro de
  // conectarWhatsapp e pode disparar antes de esta linha resolver. Um `const`
  // destruturado daria ReferenceError por TDZ nesse intervalo.
  let enviarMensagem
  const conexao = await conectarWhatsapp((msg) => tratarMensagemRecebida(msg, enviarMensagem))
  enviarMensagem = conexao.enviarMensagem

  const scheduler = iniciarScheduler((numero, texto) => enviarMensagem(numero, texto))
  console.log(`[tars] scheduler ativo (${config.timezone})`)

  const encerrar = () => {
    scheduler.parar()
    process.exit(0)
  }
  process.on('SIGTERM', encerrar)
  process.on('SIGINT', encerrar)
}

main().catch((e) => {
  console.error('[tars] falha ao iniciar:', e)
  process.exit(1)
})
