#!/usr/bin/env node
/**
 * Migração: acrescenta 'configurou_credencial' ao CHECK de `auditoria_admin.acao`.
 *
 *   node scripts/migrar-conexao-llm.js
 *   docker compose exec dashboard node scripts/migrar-conexao-llm.js
 *
 * Por que script e não recriar o volume: até esta mudança, recriar era gratuito
 * porque o banco estava vazio. Hoje ele contém a conta de administrador com a
 * senha que o operador definiu — recriar faria o bootstrap restaurá-la a partir
 * do ADMIN_PASSWORD do .env, desfazendo a troca em silêncio.
 *
 * SQLite não altera CHECK com ALTER TABLE. O caminho é tabela nova, cópia, drop,
 * rename — tudo numa transação, com foreign_keys=OFF para que o DROP não dispare
 * CASCADE sobre as filhas.
 *
 * Idempotente: se o valor já existe na definição da tabela, não faz nada.
 */
import { getDb, closeDb } from '../src/db/db.js'

const db = getDb()

const definicao = db
  .prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'auditoria_admin'")
  .get()?.sql

if (!definicao) {
  console.log('[migração] tabela auditoria_admin não existe — nada a fazer.')
  closeDb()
  process.exit(0)
}

if (definicao.includes('configurou_credencial')) {
  console.log('[migração] já aplicada — nada a fazer.')
  closeDb()
  process.exit(0)
}

const antes = db.prepare('SELECT COUNT(*) AS n FROM auditoria_admin').get().n
console.log(`[migração] ${antes} linha(s) de auditoria a preservar.`)

// Fora da transação: o SQLite ignora a mudança deste pragma dentro de uma.
db.pragma('foreign_keys = OFF')

db.transaction(() => {
  db.exec(`
    CREATE TABLE auditoria_admin_nova (
      auditoria_id INTEGER PRIMARY KEY AUTOINCREMENT,
      autor_id     INTEGER REFERENCES admin_usuarios(admin_id),
      alvo_id      INTEGER REFERENCES admin_usuarios(admin_id),
      acao         TEXT    NOT NULL
                           CHECK (acao IN ('criou', 'desativou', 'reativou',
                                           'resetou_senha', 'trocou_propria_senha',
                                           'entrou', 'configurou_credencial')),
      descricao    TEXT    NOT NULL,
      momento      TEXT    NOT NULL DEFAULT (datetime('now'))
    );

    INSERT INTO auditoria_admin_nova (auditoria_id, autor_id, alvo_id, acao, descricao, momento)
      SELECT auditoria_id, autor_id, alvo_id, acao, descricao, momento FROM auditoria_admin;

    DROP TABLE auditoria_admin;
    ALTER TABLE auditoria_admin_nova RENAME TO auditoria_admin;

    CREATE INDEX IF NOT EXISTS idx_auditoria_admin_momento ON auditoria_admin (momento);
  `)
})()

db.pragma('foreign_keys = ON')

const depois = db.prepare('SELECT COUNT(*) AS n FROM auditoria_admin').get().n
const violacoes = db.pragma('foreign_key_check')

if (depois !== antes) {
  console.error(`[migração] FALHOU: ${antes} linhas antes, ${depois} depois.`)
  closeDb()
  process.exit(1)
}
if (violacoes.length) {
  console.error('[migração] FALHOU: chaves estrangeiras violadas após a migração.')
  closeDb()
  process.exit(1)
}

console.log(`[migração] concluída. ${depois} linha(s) preservada(s), FKs íntegras.`)
closeDb()
