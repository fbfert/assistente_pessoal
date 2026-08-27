import { getDb } from './db.js'

/**
 * Log append-only das ações sobre a EQUIPE.
 *
 * Separado de `historico_interacoes`, que é a linha do tempo de um participante
 * e cujo `usuario_id` é obrigatório. Criar um administrador não tem participante
 * associado — e forçar um ali contaminaria as métricas do painel.
 */

export const ACOES = Object.freeze({
  CRIOU: 'criou',
  DESATIVOU: 'desativou',
  REATIVOU: 'reativou',
  RESETOU_SENHA: 'resetou_senha',
  TROCOU_PROPRIA_SENHA: 'trocou_propria_senha',
  ENTROU: 'entrou',
  CONFIGUROU_CREDENCIAL: 'configurou_credencial',
  /**
   * Mudança na configuração viva — número, horário, texto do produto.
   *
   * Vai para cá, e não para `historico_interacoes`, porque é ação sobre o
   * SISTEMA: não tem participante associado, e aquela tabela exige um.
   */
  CONFIGUROU_SISTEMA: 'configurou_sistema',
})

/** A senha gerada NUNCA entra aqui — nem na descrição. */
export function registrarAcaoAdmin({ autorId = null, alvoId = null, acao, descricao }, db = getDb()) {
  const { lastInsertRowid } = db
    .prepare(
      'INSERT INTO auditoria_admin (autor_id, alvo_id, acao, descricao, momento) VALUES (?, ?, ?, ?, ?)',
    )
    .run(autorId, alvoId, acao, descricao, new Date().toISOString())
  return db.prepare('SELECT * FROM auditoria_admin WHERE auditoria_id = ?').get(lastInsertRowid)
}

export function listarAuditoriaAdmin(limite = 100, db = getDb()) {
  return db
    .prepare(
      `SELECT a.*,
              autor.email AS autor_email,
              alvo.email  AS alvo_email
         FROM auditoria_admin a
    LEFT JOIN admin_usuarios autor ON autor.admin_id = a.autor_id
    LEFT JOIN admin_usuarios alvo  ON alvo.admin_id  = a.alvo_id
     ORDER BY a.momento DESC, a.auditoria_id DESC
        LIMIT ?`,
    )
    .all(limite)
}
