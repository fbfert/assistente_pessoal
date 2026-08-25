import { config } from '../config.js'
import { getDb } from '../db/db.js'
import {
  funilRetencao,
  despejosEspontaneosPorUsuario,
  silenciosPorUsuario,
  correcoesReportadas,
} from '../db/interactionLog.js'

/**
 * Uma linha por usuário do piloto, com o que o operador precisa ver.
 *
 * `alertaSobrecarga` é o único julgamento aqui: verdadeiro quando QUALQUER
 * contador de silêncio da pessoa cruzou o limiar configurado. É o sinal de
 * que alguém está sumindo — o que no piloto importa mais que qualquer média.
 */
export function resumoPiloto(db = getDb()) {
  const limite = config.silenciosAteReduzirTom

  const funil = funilRetencao(db)
  const despejos = new Map(despejosEspontaneosPorUsuario(db).map((d) => [d.usuario_id, d]))
  const correcoes = correcoesReportadas(db)

  const silenciosPor = new Map()
  for (const s of silenciosPorUsuario(db)) {
    if (!silenciosPor.has(s.usuario_id)) silenciosPor.set(s.usuario_id, {})
    silenciosPor.get(s.usuario_id)[s.gatilho_tipo] = s.silencio_consecutivo
  }

  const usuarios = funil.map((u) => {
    const silencios = silenciosPor.get(u.usuario_id) ?? {}
    const maiorSilencio = Math.max(0, ...Object.values(silencios))

    return {
      usuarioId: u.usuario_id,
      nome: u.nome,
      numero: u.numero_whatsapp,
      anamneseEstado: u.anamnese_estado,
      consentiu: Boolean(u.consentimento_aceito),
      concluiuAnamnese: u.anamnese_estado === 12,
      pausado: Boolean(u.pausado),
      checkinsDisparados: u.checkins_disparados,
      checkinsRespondidos: u.checkins_respondidos,
      taxaResposta:
        u.checkins_disparados > 0
          ? Math.round((u.checkins_respondidos / u.checkins_disparados) * 100)
          : null,
      despejosSemana: despejos.get(u.usuario_id)?.contagem ?? 0,
      semanaInicio: despejos.get(u.usuario_id)?.semana_inicio ?? null,
      silencios,
      maiorSilencio,
      alertaSobrecarga: maiorSilencio >= limite,
      correcoes: correcoes.filter((c) => c.usuario_id === u.usuario_id).length,
    }
  })

  return {
    limiteSilencio: limite,
    janelaMin: config.respostaGatilhoJanelaMin,
    usuarios,
    correcoes,
    totais: {
      convidados: usuarios.length,
      consentiram: usuarios.filter((u) => u.consentiu).length,
      concluiram: usuarios.filter((u) => u.concluiuAnamnese).length,
      emAlerta: usuarios.filter((u) => u.alertaSobrecarga).length,
    },
  }
}

/**
 * Esteira do piloto, nominal.
 *
 * A contagem diz que existe um problema; a lista diz em quem cutucar. Por isso
 * cada estágio devolve os participantes, não só o total.
 */
export function esteira(db = getDb()) {
  const todos = resumoPiloto(db).usuarios

  return {
    pendentes: todos.filter((u) => !u.consentiu),
    emAndamento: todos.filter((u) => u.consentiu && !u.concluiuAnamnese),
    concluidos: todos.filter((u) => u.concluiuAnamnese),
  }
}
