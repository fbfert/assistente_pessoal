import { Router } from 'express'
import QRCode from 'qrcode'
import {
  lerEstadoConexao,
  qrEstaValido,
  VALIDADE_QR_MS,
} from '../../db/estadoConexaoRepo.js'
import { pagina, escapar, haQuantoTempo } from '../html.js'

export const rotasConexao = Router()

rotasConexao.get('/conexao', async (_req, res) => {
  const estado = lerEstadoConexao()
  const valido = qrEstaValido(estado)

  // O QR vira PNG aqui, no admin. `qrcode-terminal` (usado pelo bot) só produz
  // ASCII para terminal — não serve para <img>. A tabela guarda o texto bruto
  // justamente para que cada lado renderize do jeito que precisa.
  const dataUri = valido ? await QRCode.toDataURL(estado.qr_atual, { margin: 2, width: 320 }) : null

  res.type('html').send(
    pagina('Conexão', renderizarConexao({ estado, valido, dataUri }), {
      // Auto-refresh por meta http-equiv: o projeto não tem JavaScript de
      // cliente, e o QR se renova a cada ~20s. 5s mantém a tela útil sem
      // introduzir a primeira dependência de script do repositório.
      cabeca: estado.conectado ? '' : '<meta http-equiv="refresh" content="5">',
    }),
  )
})

export function renderizarConexao({ estado, valido, dataUri }) {
  const idade = haQuantoTempo(estado.atualizado_em)

  if (estado.conectado) {
    return `<h1>WhatsApp conectado</h1>
<p class="nota">Atualizado ${escapar(idade)}.</p>
<p>O bot está pareado e recebendo mensagens. Nada a fazer aqui.</p>`
  }

  if (valido) {
    return `<h1>Aguardando pareamento</h1>
<p class="nota">QR gerado ${escapar(idade)}. Esta página se atualiza sozinha a cada 5 segundos.</p>
<p><img src="${dataUri}" alt="QR code de pareamento do WhatsApp" width="320" height="320"></p>
<p>No celular do <strong>chip dedicado</strong>: WhatsApp → Dispositivos conectados →
Conectar um dispositivo.</p>`
  }

  if (estado.qr_atual) {
    return `<h1>QR expirado</h1>
<p class="nota">O último QR foi gerado ${escapar(idade)} e vale por
${Math.round(VALIDADE_QR_MS / 1000)} segundos.</p>
<div class="aviso">Este QR não funciona mais. O bot gera um novo automaticamente —
esta página se atualiza sozinha a cada 5 segundos.</div>`
  }

  // O Baileys reporta 'loggedOut' (camelCase). Um regex /logout/ NÃO casa com
  // isso — são strings diferentes — e o aviso de "precisa parear de novo"
  // nunca apareceria justamente no caso em que ele importa.
  const motivo = String(estado.motivo_desconexao ?? '').toLowerCase()
  const logout = motivo.includes('loggedout') || motivo.includes('logout')

  return `<h1>Desconectado</h1>
<p class="nota">${
    estado.atualizado_em ? `Atualizado ${escapar(idade)}.` : 'O bot ainda não publicou nenhum estado.'
  }</p>
${estado.motivo_desconexao ? `<p>Motivo: <code>${escapar(estado.motivo_desconexao)}</code></p>` : ''}
${
  logout
    ? `<div class="aviso">A sessão foi encerrada por logout. Reconexão automática não resolve:
       é preciso parear de novo, presencialmente, com o chip.</div>`
    : '<p>Aguardando o bot gerar um QR. Esta página se atualiza sozinha a cada 5 segundos.</p>'
}`
}
