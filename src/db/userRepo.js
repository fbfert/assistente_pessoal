import { getDb } from './db.js'
import {
  SEM_INFORMACAO,
  TIPOS_GATILHO,
  HORARIO_PADRAO_CHECKIN,
  HORARIO_PADRAO_CHECKLIST,
} from '../constants.js'

/**
 * Campos de anamnese graváveis pelo setter genérico.
 * Whitelist fechada: o nome do campo vira nome de coluna na query, então
 * aceitar qualquer string aqui seria injeção de SQL.
 */
export const CAMPOS_ANAMNESE = Object.freeze([
  'nome',
  'o_que_trava',
  'rotina_boa',
  'rotina_ruim',
  'gatilhos_de_sobrecarga',
  'sinal_de_alerta',
  'pessoas_chave',
  'vocabulario_proprio',
  'nunca_fazer',
])

const agora = () => new Date().toISOString()

// --- Usuário -----------------------------------------------------------------

export function findByWhatsapp(numero, db = getDb()) {
  return db.prepare('SELECT * FROM usuarios WHERE numero_whatsapp = ?').get(numero) ?? null
}

export function findById(usuarioId, db = getDb()) {
  return db.prepare('SELECT * FROM usuarios WHERE usuario_id = ?').get(usuarioId) ?? null
}

export function createUsuario(numero, db = getDb()) {
  const { lastInsertRowid } = db
    .prepare('INSERT INTO usuarios (numero_whatsapp) VALUES (?)')
    .run(numero)
  return findById(lastInsertRowid, db)
}

/** Idempotente: chamar duas vezes com o mesmo número devolve o mesmo usuário. */
export function findOrCreate(numero, db = getDb()) {
  return findByWhatsapp(numero, db) ?? createUsuario(numero, db)
}

export function registrarConsentimento(usuarioId, versao, db = getDb()) {
  db.prepare(
    `UPDATE usuarios
        SET consentimento_aceito = 1,
            consentimento_versao = ?,
            consentimento_timestamp = ?
      WHERE usuario_id = ?`,
  ).run(versao, agora(), usuarioId)
  return findById(usuarioId, db)
}

/**
 * Troca o estado da anamnese. Zera `anamnese_exemplo_pedido` porque o flag de
 * "já dei uma segunda chance" é por estado, não por usuário.
 */
export function setAnamneseEstado(usuarioId, estado, db = getDb()) {
  db.prepare(
    `UPDATE usuarios
        SET anamnese_estado = ?,
            anamnese_exemplo_pedido = 0,
            anamnese_ultima_mensagem_em = ?
      WHERE usuario_id = ?`,
  ).run(estado, agora(), usuarioId)
  return findById(usuarioId, db)
}

/** Marca que a segunda chance do estado corrente já foi usada (exemplo pedido / repergunta). */
export function marcarExemploPedido(usuarioId, db = getDb()) {
  db.prepare('UPDATE usuarios SET anamnese_exemplo_pedido = 1 WHERE usuario_id = ?').run(usuarioId)
  return findById(usuarioId, db)
}

export function salvarCampoAnamnese(usuarioId, campo, valor, db = getDb()) {
  if (!CAMPOS_ANAMNESE.includes(campo)) {
    throw new Error(`Campo de anamnese desconhecido: ${campo}`)
  }
  db.prepare(`UPDATE usuarios SET ${campo} = ? WHERE usuario_id = ?`).run(valor, usuarioId)
  return findById(usuarioId, db)
}

export function salvarVocabularioProprio(usuarioId, valor, db = getDb()) {
  return salvarCampoAnamnese(usuarioId, 'vocabulario_proprio', valor, db)
}

export function setPersonalidade(usuarioId, personalidade, db = getDb()) {
  db.prepare('UPDATE usuarios SET personalidade = ? WHERE usuario_id = ?').run(
    personalidade,
    usuarioId,
  )
  return findById(usuarioId, db)
}

export function listarUsuariosAtivos(db = getDb()) {
  return db.prepare('SELECT * FROM usuarios WHERE anamnese_estado = 12').all()
}

// --- Remédios ----------------------------------------------------------------

export function adicionarRemedio(usuarioId, nome, horario, db = getDb()) {
  // Regra 1b: campo ausente vira o sentinela, nunca um chute.
  const { lastInsertRowid } = db
    .prepare('INSERT INTO remedios (usuario_id, nome, horario) VALUES (?, ?, ?)')
    .run(usuarioId, nome || SEM_INFORMACAO, horario || SEM_INFORMACAO)
  return db.prepare('SELECT * FROM remedios WHERE remedio_id = ?').get(lastInsertRowid)
}

export function listarRemedios(usuarioId, db = getDb()) {
  return db.prepare('SELECT * FROM remedios WHERE usuario_id = ? ORDER BY remedio_id').all(usuarioId)
}

// --- Gatilhos ----------------------------------------------------------------

export function configurarGatilho(usuarioId, tipo, horario, ativo = 1, remedioId = null, db = getDb()) {
  const { lastInsertRowid } = db
    .prepare(
      'INSERT INTO gatilhos_configurados (usuario_id, tipo, horario, ativo, remedio_id) VALUES (?, ?, ?, ?, ?)',
    )
    .run(usuarioId, tipo, horario, ativo ? 1 : 0, remedioId)
  return db.prepare('SELECT * FROM gatilhos_configurados WHERE gatilho_id = ?').get(lastInsertRowid)
}

export function listarGatilhosUsuario(usuarioId, db = getDb()) {
  return db
    .prepare('SELECT * FROM gatilhos_configurados WHERE usuario_id = ? ORDER BY gatilho_id')
    .all(usuarioId)
}

/** Só gatilhos ativos de usuário com anamnese concluída. Quem está em onboarding não recebe disparo. */
export function listarGatilhosAtivos(db = getDb()) {
  return db
    .prepare(
      `SELECT g.*, u.numero_whatsapp, u.personalidade, u.nome AS usuario_nome, r.nome AS remedio_nome
         FROM gatilhos_configurados g
         JOIN usuarios u ON u.usuario_id = g.usuario_id
    LEFT JOIN remedios r ON r.remedio_id = g.remedio_id
        WHERE g.ativo = 1
          AND u.anamnese_estado = 12
     ORDER BY g.usuario_id, g.horario`,
    )
    .all()
}

/**
 * Gatilhos padrão do MVP, criados ao concluir a anamnese.
 *
 * Remédio sem nome OU sem horário NÃO vira gatilho — não há o que lembrar.
 * A comparação é contra a constante SEM_INFORMACAO; ver src/constants.js
 * para o porquê de ela não ser um literal repetido.
 */
export function ativarGatilhosPadrao(usuarioId, db = getDb()) {
  const criados = []

  criados.push(
    configurarGatilho(usuarioId, TIPOS_GATILHO.CHECKIN_MANHA, HORARIO_PADRAO_CHECKIN, 1, null, db),
  )

  for (const remedio of listarRemedios(usuarioId, db)) {
    if (remedio.nome === SEM_INFORMACAO || remedio.horario === SEM_INFORMACAO) continue
    criados.push(
      configurarGatilho(usuarioId, TIPOS_GATILHO.REMEDIO, remedio.horario, 1, remedio.remedio_id, db),
    )
  }

  // Terceiro gatilho da esteira, mas nasce DESLIGADO no piloto (ativo = 0).
  // Ativação é decisão manual, não automática.
  criados.push(
    configurarGatilho(
      usuarioId,
      TIPOS_GATILHO.CHECKLIST_FIM_DIA,
      HORARIO_PADRAO_CHECKLIST,
      0,
      null,
      db,
    ),
  )

  return criados
}

export function concluirAnamnese(usuarioId, db = getDb()) {
  const usuario = setAnamneseEstado(usuarioId, 12, db)
  ativarGatilhosPadrao(usuarioId, db)
  return usuario
}

// --- Contadores de silêncio --------------------------------------------------

export function getSilencioConsecutivo(usuarioId, gatilhoTipo, db = getDb()) {
  const linha = db
    .prepare('SELECT silencio_consecutivo FROM contadores WHERE usuario_id = ? AND gatilho_tipo = ?')
    .get(usuarioId, gatilhoTipo)
  return linha?.silencio_consecutivo ?? 0
}

export function incrementarSilencio(usuarioId, gatilhoTipo, db = getDb()) {
  db.prepare(
    `INSERT INTO contadores (usuario_id, gatilho_tipo, silencio_consecutivo)
          VALUES (?, ?, 1)
     ON CONFLICT (usuario_id, gatilho_tipo)
     DO UPDATE SET silencio_consecutivo = silencio_consecutivo + 1`,
  ).run(usuarioId, gatilhoTipo)
  return getSilencioConsecutivo(usuarioId, gatilhoTipo, db)
}

export function zerarSilencio(usuarioId, gatilhoTipo, db = getDb()) {
  db.prepare(
    `INSERT INTO contadores (usuario_id, gatilho_tipo, silencio_consecutivo)
          VALUES (?, ?, 0)
     ON CONFLICT (usuario_id, gatilho_tipo)
     DO UPDATE SET silencio_consecutivo = 0`,
  ).run(usuarioId, gatilhoTipo)
  return 0
}

// --- Despejos por semana -----------------------------------------------------

/** Segunda-feira que abre a semana da data informada, em YYYY-MM-DD. */
export function inicioDaSemana(data = new Date()) {
  const d = new Date(Date.UTC(data.getUTCFullYear(), data.getUTCMonth(), data.getUTCDate()))
  const diaDaSemana = d.getUTCDay() // 0 = domingo
  const recuo = diaDaSemana === 0 ? 6 : diaDaSemana - 1
  d.setUTCDate(d.getUTCDate() - recuo)
  return d.toISOString().slice(0, 10)
}

export function incrementarDespejoEspontaneo(usuarioId, data = new Date(), db = getDb()) {
  const semana = inicioDaSemana(data)
  const atual = db.prepare('SELECT * FROM despejos_semana WHERE usuario_id = ?').get(usuarioId)

  if (!atual) {
    db.prepare(
      'INSERT INTO despejos_semana (usuario_id, semana_inicio, contagem) VALUES (?, ?, 1)',
    ).run(usuarioId, semana)
    return 1
  }

  if (atual.semana_inicio !== semana) {
    // Virou a semana: reinicia em 1 em vez de somar sobre a semana passada.
    db.prepare(
      'UPDATE despejos_semana SET semana_inicio = ?, contagem = 1 WHERE usuario_id = ?',
    ).run(semana, usuarioId)
    return 1
  }

  db.prepare('UPDATE despejos_semana SET contagem = contagem + 1 WHERE usuario_id = ?').run(usuarioId)
  return atual.contagem + 1
}

export function getDespejosSemana(usuarioId, db = getDb()) {
  const linha = db.prepare('SELECT * FROM despejos_semana WHERE usuario_id = ?').get(usuarioId)
  return linha ?? { usuario_id: usuarioId, semana_inicio: inicioDaSemana(), contagem: 0 }
}
