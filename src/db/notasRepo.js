import { getDb } from './db.js'
import { CAMPOS_APRENDIVEIS } from './userRepo.js'

/**
 * Notas de perfil aprendidas fora da anamnese.
 *
 * Empilham por cima da resposta original — nunca a substituem. É o mesmo
 * princípio append-only de `historico_interacoes`, e é o que permite responder
 * "isso ela disse na anamnese ou o bot deduziu?".
 *
 * Remoção é SOFT, sempre: a nota errada some do contexto e continua no banco,
 * com quando e por quem foi removida. Nada aqui apaga linha — exceto o reinício
 * de anamnese, que é o único caso em que o perfil velho inteiro deixa de valer.
 */

export function criarNota({ usuarioId, campo, texto, interacaoId = null }, db = getDb()) {
  // Validação antes do banco: o CHECK do schema é a última linha de defesa, não a
  // primeira, e o erro dele não diz quem chamou errado.
  if (!CAMPOS_APRENDIVEIS.includes(campo)) {
    throw new Error(`Campo não aprendível: ${campo}`)
  }

  const limpo = String(texto ?? '').trim()
  if (!limpo) throw new Error('Nota sem texto')

  const { lastInsertRowid } = db
    .prepare(
      'INSERT INTO notas_aprendidas (usuario_id, campo, texto, interacao_id) VALUES (?, ?, ?, ?)',
    )
    .run(usuarioId, campo, limpo, interacaoId)

  return buscarNota(lastInsertRowid, db)
}

export function buscarNota(notaId, db = getDb()) {
  return db.prepare('SELECT * FROM notas_aprendidas WHERE nota_id = ?').get(notaId) ?? null
}

/** Só as ativas: nota removida não volta ao contexto nem à tela. */
export function listarNotasAtivas(usuarioId, db = getDb()) {
  return db
    .prepare(
      `SELECT * FROM notas_aprendidas
        WHERE usuario_id = ? AND removido_em IS NULL
     ORDER BY campo, nota_id`,
    )
    .all(usuarioId)
}

/** Todas, inclusive removidas — para a página do participante e para auditoria. */
export function listarTodasAsNotas(usuarioId, db = getDb()) {
  return db
    .prepare('SELECT * FROM notas_aprendidas WHERE usuario_id = ? ORDER BY campo, nota_id')
    .all(usuarioId)
}

/** `{ campo: [nota, ...] }`, só das ativas — a forma que o prompt e a tela consomem. */
export function notasAtivasPorCampo(usuarioId, db = getDb()) {
  const agrupadas = {}
  for (const nota of listarNotasAtivas(usuarioId, db)) {
    ;(agrupadas[nota.campo] ??= []).push(nota)
  }
  return agrupadas
}

/** Soft delete. NUNCA DELETE: a nota errada precisa continuar auditável. */
export function removerNota(notaId, adminId = null, db = getDb()) {
  db.prepare(
    'UPDATE notas_aprendidas SET removido_em = ?, removido_por = ? WHERE nota_id = ? AND removido_em IS NULL',
  ).run(new Date().toISOString(), adminId, notaId)

  return buscarNota(notaId, db)
}

/**
 * Único caminho que apaga de verdade: o reinício de anamnese.
 *
 * Notas construídas sobre o perfil velho contaminariam o novo — é o mesmo motivo
 * pelo qual remédios e gatilhos já são apagados ali. O rastro de que existiram
 * continua em `historico_interacoes`, que ninguém apaga.
 */
export function apagarNotasDoUsuario(usuarioId, db = getDb()) {
  return db.prepare('DELETE FROM notas_aprendidas WHERE usuario_id = ?').run(usuarioId).changes
}

/** Anonimização: o texto é escrito pela própria pessoa, recortado da conversa. */
export function redigirNotasDoUsuario(usuarioId, marcador, db = getDb()) {
  return db
    .prepare('UPDATE notas_aprendidas SET texto = ? WHERE usuario_id = ?')
    .run(marcador, usuarioId).changes
}
