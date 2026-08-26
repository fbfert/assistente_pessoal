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

  if (ampliarTiposDeInteracao(db)) aplicadas.push('historico_interacoes.tipo (+mensagem_enviada)')

  if (aplicadas.length) console.log(`[db] migrações aplicadas: ${aplicadas.join(', ')}`)

  return aplicadas
}

/**
 * Mantém o CHECK de `historico_interacoes.tipo` na lista atual.
 *
 * CHECK não se altera com `ALTER TABLE` no SQLite. O caminho é o do AGENTS.md §6:
 * dentro de uma transação e com as chaves estrangeiras DESLIGADAS, cria-se a
 * tabela nova com a constraint atualizada, copiam-se os dados, dropa-se a antiga
 * e renomeia-se.
 *
 * O `foreign_keys = OFF` é essencial e vai FORA da transação — o SQLite ignora
 * essa mudança dentro de uma. Sem ele, o `DROP` da tabela antiga dispararia o
 * CASCADE sobre as filhas.
 *
 * As linhas são contadas antes e depois: divergência aborta em vez de seguir com
 * um histórico incompleto, que é o tipo de perda que ninguém percebe na hora.
 *
 * @returns {boolean} true quando a migração rodou agora
 */
function ampliarTiposDeInteracao(db) {
  const definicao = db
    .prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'historico_interacoes'")
    .get()?.sql

  // O sentinela é sempre o valor MAIS NOVO da lista: um banco que já tem os
  // anteriores mas não este ainda precisa da recriação.
  if (!definicao || definicao.includes('mensagem_enviada')) return false

  const antes = db.prepare('SELECT COUNT(*) n FROM historico_interacoes').get().n
  const estavamLigadas = db.pragma('foreign_keys', { simple: true })

  db.pragma('foreign_keys = OFF')
  try {
    db.transaction(() => {
      db.exec(`
        CREATE TABLE historico_interacoes_novo (
          interacao_id        INTEGER PRIMARY KEY AUTOINCREMENT,
          usuario_id          INTEGER NOT NULL REFERENCES usuarios(usuario_id) ON DELETE CASCADE,
          tipo                TEXT    NOT NULL
                                      CHECK (tipo IN ('gatilho_disparado', 'resposta_gatilho',
                                                      'despejo_espontaneo', 'silencio',
                                                      'correcao_reportada', 'anamnese',
                                                      'acao_admin', 'entrada_web',
                                                      'mensagem_enviada')),
          timestamp           TEXT    NOT NULL,
          texto               TEXT,
          gatilho_relacionado TEXT,
          canal               TEXT    NOT NULL DEFAULT 'whatsapp'
                                      CHECK (canal IN ('whatsapp', 'web'))
        );

        INSERT INTO historico_interacoes_novo
               (interacao_id, usuario_id, tipo, timestamp, texto, gatilho_relacionado, canal)
        SELECT  interacao_id, usuario_id, tipo, timestamp, texto, gatilho_relacionado, canal
          FROM  historico_interacoes;

        DROP TABLE historico_interacoes;
        ALTER TABLE historico_interacoes_novo RENAME TO historico_interacoes;

        CREATE INDEX IF NOT EXISTS idx_historico_usuario_timestamp
          ON historico_interacoes (usuario_id, timestamp);
      `)

      const depois = db.prepare('SELECT COUNT(*) n FROM historico_interacoes').get().n
      if (depois !== antes) {
        // Dentro da transação: lançar aqui desfaz tudo.
        throw new Error(`migração perderia linhas: ${antes} antes, ${depois} depois`)
      }
    })()
  } finally {
    if (estavamLigadas) db.pragma('foreign_keys = ON')
  }

  return true
}
