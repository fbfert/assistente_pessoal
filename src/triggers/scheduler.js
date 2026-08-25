import cron from 'node-cron'
import { config } from '../config.js'
import { TIPOS_INTERACAO } from '../constants.js'
import { montarMensagemGatilho } from './messages.js'
import {
  listarGatilhosAtivos,
  getSilencioConsecutivo,
  incrementarSilencio,
  zerarSilencio,
} from '../db/userRepo.js'
import {
  registrar,
  jaDisparouHoje,
  houveRespostaOuSilencioApos,
  ultimoDisparoDoTipo,
} from '../db/interactionLog.js'

const MS_POR_MINUTO = 60_000

/**
 * Hora corrente em São Paulo, calculada explicitamente.
 * Não confia no TZ do processo: o container pode subir em UTC e ninguém nota
 * até o check-in das 8h chegar às 5h.
 */
export function agoraEmSaoPaulo(data = new Date(), timeZone = config.timezone) {
  const partes = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(data)

  const get = (tipo) => partes.find((p) => p.type === tipo)?.value ?? '00'
  const hora = get('hour') === '24' ? '00' : get('hour')

  return {
    dia: `${get('year')}-${get('month')}-${get('day')}`,
    horario: `${hora}:${get('minute')}`,
  }
}

/**
 * Sobe os dois ticks do scheduler.
 *
 * @param {(numeroWhatsapp: string, texto: string) => Promise<void>} enviarMensagem
 * @returns {{parar: () => void}}
 */
export function iniciarScheduler(enviarMensagem) {
  const opcoes = { timezone: config.timezone }

  const tickMinuto = cron.schedule('* * * * *', () => {
    dispararGatilhosDoMinuto(enviarMensagem).catch((e) =>
      console.error('[scheduler] falha no tick de minuto:', e?.message ?? e),
    )
  }, opcoes)

  const tickSilencio = cron.schedule('*/5 * * * *', () => {
    conciliarSilencios().catch((e) =>
      console.error('[scheduler] falha no tick de silêncio:', e?.message ?? e),
    )
  }, opcoes)

  return {
    parar() {
      tickMinuto.stop()
      tickSilencio.stop()
    },
  }
}

/** Tick de minuto: dispara o que bate com a hora corrente de São Paulo. */
export async function dispararGatilhosDoMinuto(enviarMensagem, agora = new Date()) {
  const { dia, horario } = agoraEmSaoPaulo(agora)
  const disparados = []

  for (const gatilho of listarGatilhosAtivos()) {
    if (gatilho.horario !== horario) continue

    // Nunca o mesmo tipo duas vezes no mesmo dia para o mesmo usuário.
    if (jaDisparouHoje(gatilho.usuario_id, gatilho.tipo, dia)) continue

    const silencios = getSilencioConsecutivo(gatilho.usuario_id, gatilho.tipo)
    const reduzido = silencios >= config.silenciosAteReduzirTom

    const texto = montarMensagemGatilho(gatilho.tipo, {
      reduzido,
      nomeRemedio: gatilho.remedio_nome,
    })

    await enviarMensagem(gatilho.numero_whatsapp, texto)

    registrar({
      usuarioId: gatilho.usuario_id,
      tipo: TIPOS_INTERACAO.GATILHO_DISPARADO,
      texto,
      gatilhoRelacionado: gatilho.tipo,
      timestamp: agora.toISOString(),
    })

    disparados.push({ usuarioId: gatilho.usuario_id, tipo: gatilho.tipo, reduzido })
  }

  return disparados
}

/**
 * Tick de 5 minutos: fecha a conta dos disparos cuja janela já expirou.
 *
 * Resposta dentro da janela zera o contador; ausência de resposta registra
 * `silencio` e incrementa. O disparo só é avaliado depois que a janela fecha,
 * para não contar como silêncio quem ainda pode responder.
 */
export async function conciliarSilencios(agora = new Date()) {
  const janelaMs = config.respostaGatilhoJanelaMin * MS_POR_MINUTO
  const resultados = []

  for (const gatilho of listarGatilhosAtivos()) {
    const disparo = ultimoDisparoPendente(gatilho, agora, janelaMs)
    if (!disparo) continue

    if (houveRespostaOuSilencioApos(gatilho.usuario_id, gatilho.tipo, disparo.timestamp)) {
      // Já resolvido: ou a pessoa respondeu, ou o silêncio já foi contabilizado.
      continue
    }

    registrar({
      usuarioId: gatilho.usuario_id,
      tipo: TIPOS_INTERACAO.SILENCIO,
      gatilhoRelacionado: gatilho.tipo,
      timestamp: agora.toISOString(),
    })
    const total = incrementarSilencio(gatilho.usuario_id, gatilho.tipo)

    resultados.push({ usuarioId: gatilho.usuario_id, tipo: gatilho.tipo, silencios: total })
  }

  return resultados
}

/** Último disparo deste tipo cuja janela de resposta já fechou. */
function ultimoDisparoPendente(gatilho, agora, janelaMs) {
  const disparo = ultimoDisparoDoTipo(gatilho.usuario_id, gatilho.tipo)
  if (!disparo) return null

  const fechouEm = new Date(disparo.timestamp).getTime() + janelaMs
  return agora.getTime() >= fechouEm ? disparo : null
}

/** Zera o contador quando a pessoa responde — chamado pelo handler. */
export function registrarRespostaDeGatilho(usuarioId, gatilhoTipo) {
  return zerarSilencio(usuarioId, gatilhoTipo)
}
