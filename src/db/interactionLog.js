import { getDb } from './db.js'
import { TIPOS_INTERACAO, CANAIS } from '../constants.js'
import { config } from '../config.js'

/**
 * Log append-only de interações. Nada aqui é atualizado nem apagado —
 * é a base das métricas do piloto e do rastro de consentimento.
 */
export function registrar(
  {
    usuarioId,
    tipo,
    texto = null,
    gatilhoRelacionado = null,
    timestamp = new Date().toISOString(),
    // Padrão explícito: quem não informa canal está no fluxo do WhatsApp, que é
    // o único que existia quando cada um destes chamadores foi escrito.
    canal = CANAIS.WHATSAPP,
  },
  db = getDb(),
) {
  const { lastInsertRowid } = db
    .prepare(
      `INSERT INTO historico_interacoes (usuario_id, tipo, timestamp, texto, gatilho_relacionado, canal)
            VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .run(usuarioId, tipo, timestamp, texto, gatilhoRelacionado, canal)
  return db.prepare('SELECT * FROM historico_interacoes WHERE interacao_id = ?').get(lastInsertRowid)
}

export function ultimoGatilhoDisparado(usuarioId, db = getDb()) {
  return (
    db
      .prepare(
        `SELECT * FROM historico_interacoes
          WHERE usuario_id = ? AND tipo = ?
       ORDER BY timestamp DESC, interacao_id DESC
          LIMIT 1`,
      )
      .get(usuarioId, TIPOS_INTERACAO.GATILHO_DISPARADO) ?? null
  )
}

/** Já houve disparo deste tipo para este usuário na data informada (YYYY-MM-DD)? */
export function jaDisparouHoje(usuarioId, gatilhoTipo, dia, db = getDb()) {
  const linha = db
    .prepare(
      `SELECT 1 FROM historico_interacoes
        WHERE usuario_id = ?
          AND tipo = ?
          AND gatilho_relacionado = ?
          AND substr(timestamp, 1, 10) = ?
        LIMIT 1`,
    )
    .get(usuarioId, TIPOS_INTERACAO.GATILHO_DISPARADO, gatilhoTipo, dia)
  return Boolean(linha)
}

/**
 * O disparo já foi resolvido — por resposta ou por silêncio já contabilizado?
 * Usado pelo tick de 5 minutos para não contar o mesmo silêncio duas vezes.
 */
export function houveRespostaOuSilencioApos(usuarioId, gatilhoRelacionado, desdeTimestamp, db = getDb()) {
  const linha = db
    .prepare(
      `SELECT 1 FROM historico_interacoes
        WHERE usuario_id = ?
          AND timestamp > ?
          AND ( (tipo = ? AND gatilho_relacionado = ?)
             OR  tipo = ? )
        LIMIT 1`,
    )
    .get(
      usuarioId,
      desdeTimestamp,
      TIPOS_INTERACAO.SILENCIO,
      gatilhoRelacionado,
      TIPOS_INTERACAO.RESPOSTA_GATILHO,
    )
  return Boolean(linha)
}

export function listarInteracoes(usuarioId, db = getDb()) {
  return db
    .prepare('SELECT * FROM historico_interacoes WHERE usuario_id = ? ORDER BY timestamp, interacao_id')
    .all(usuarioId)
}

// --- Agregações do dashboard -------------------------------------------------

/** Onde cada usuário parou na esteira: convidado → consentiu → concluiu → respondeu check-in. */
export function funilRetencao(db = getDb()) {
  return db
    .prepare(
      `SELECT u.usuario_id,
              u.numero_whatsapp,
              u.nome,
              u.anamnese_estado,
              u.consentimento_aceito,
              u.pausado,
              (SELECT COUNT(*) FROM historico_interacoes h
                WHERE h.usuario_id = u.usuario_id
                  AND h.tipo = 'gatilho_disparado'
                  AND h.gatilho_relacionado = 'checkin_manha') AS checkins_disparados,
              (SELECT COUNT(*) FROM historico_interacoes h
                WHERE h.usuario_id = u.usuario_id
                  AND h.tipo = 'resposta_gatilho'
                  AND h.gatilho_relacionado = 'checkin_manha') AS checkins_respondidos
         FROM usuarios u
     ORDER BY u.usuario_id`,
    )
    .all()
}

export function despejosEspontaneosPorUsuario(db = getDb()) {
  return db
    .prepare(
      `SELECT u.usuario_id, u.nome, u.numero_whatsapp,
              COALESCE(d.contagem, 0) AS contagem,
              d.semana_inicio
         FROM usuarios u
    LEFT JOIN despejos_semana d ON d.usuario_id = u.usuario_id
     ORDER BY u.usuario_id`,
    )
    .all()
}

/** Contadores de silêncio que cruzaram o limiar — quem está sumindo. */
export function silenciosConsecutivosCriticos(limite = config.silenciosAteReduzirTom, db = getDb()) {
  return db
    .prepare(
      `SELECT c.usuario_id, u.nome, u.numero_whatsapp, c.gatilho_tipo, c.silencio_consecutivo
         FROM contadores c
         JOIN usuarios u ON u.usuario_id = c.usuario_id
        WHERE c.silencio_consecutivo >= ?
     ORDER BY c.silencio_consecutivo DESC`,
    )
    .all(limite)
}

export function correcoesReportadas(db = getDb()) {
  return db
    .prepare(
      `SELECT h.usuario_id, u.nome, u.numero_whatsapp, h.timestamp, h.texto
         FROM historico_interacoes h
         JOIN usuarios u ON u.usuario_id = h.usuario_id
        WHERE h.tipo = ?
     ORDER BY h.timestamp DESC`,
    )
    .all(TIPOS_INTERACAO.CORRECAO_REPORTADA)
}

/** Silêncios acumulados por usuário e tipo, sem filtro de limiar. */
export function silenciosPorUsuario(db = getDb()) {
  return db
    .prepare('SELECT usuario_id, gatilho_tipo, silencio_consecutivo FROM contadores')
    .all()
}

/** Último disparo de um tipo específico de gatilho para um usuário. */
export function ultimoDisparoDoTipo(usuarioId, gatilhoTipo, db = getDb()) {
  return (
    db
      .prepare(
        `SELECT * FROM historico_interacoes
          WHERE usuario_id = ? AND tipo = ? AND gatilho_relacionado = ?
       ORDER BY timestamp DESC, interacao_id DESC
          LIMIT 1`,
      )
      .get(usuarioId, TIPOS_INTERACAO.GATILHO_DISPARADO, gatilhoTipo) ?? null
  )
}
