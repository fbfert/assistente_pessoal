/**
 * Migrações de schema para banco que JÁ EXISTE.
 *
 * `schema.sql` roda inteiro a cada abertura, mas com `CREATE TABLE IF NOT EXISTS`:
 * tabela nova entra sozinha, **coluna nova não**. Um banco criado antes de uma
 * coluna nunca a ganha por ali.
 *
 * Até aqui isso se resolvia recriando o volume, porque o banco estava vazio.
 * Deixa de ser possível assim que o WhatsApp for pareado: `/data/auth` vive no
 * mesmo volume, e reparear exige o chip em mãos, presencialmente.
 *
 * Acrescentar coluna o SQLite faz com `ALTER TABLE ... ADD COLUMN`, sem recriar a
 * tabela — diferente de alterar um CHECK, que exige o procedimento completo de
 * criar-copiar-dropar-renomear descrito no AGENTS.md §6.
 *
 * Toda migração aqui é IDEMPOTENTE: consulta o schema antes de mexer. É o que
 * permite chamá-la a cada abertura sem tabela de controle de versão — que seria a
 * solução certa para dezenas de migrações e é peso morto para as primeiras.
 */

const temColuna = (db, tabela, coluna) =>
  db.prepare(`PRAGMA table_info(${tabela})`).all().some((c) => c.name === coluna)

/**
 * @returns {string[]} o que foi aplicado agora — vazio quando não havia nada a fazer
 */
export function migrar(db) {
  const aplicadas = []

  // Segundo fator da entrada pelo canal web. Anulável: quem foi cadastrado antes
  // não tem o dado, e preencher com um palpite seria dado falso.
  if (!temColuna(db, 'usuarios', 'data_nascimento')) {
    db.exec('ALTER TABLE usuarios ADD COLUMN data_nascimento TEXT')
    aplicadas.push('usuarios.data_nascimento')
  }

  // Por onde a mensagem chegou. O padrão reescreve as linhas existentes como
  // WhatsApp, que é de onde elas vieram de fato — não é chute, é o histórico.
  if (!temColuna(db, 'historico_interacoes', 'canal')) {
    db.exec(
      `ALTER TABLE historico_interacoes
         ADD COLUMN canal TEXT NOT NULL DEFAULT 'whatsapp'
         CHECK (canal IN ('whatsapp', 'web'))`,
    )
    aplicadas.push('historico_interacoes.canal')
  }

  if (aplicadas.length) console.log(`[db] migrações aplicadas: ${aplicadas.join(', ')}`)

  return aplicadas
}
