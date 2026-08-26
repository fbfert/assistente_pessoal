-- =============================================================================
-- TARS piloto — esquema SQLite
--
-- Os nomes de coluna aqui são CONTRATO entre módulos. Renomear coluna é
-- mudança de spec (openspec/specs/armazenamento), não refatoração.
-- =============================================================================

CREATE TABLE IF NOT EXISTS usuarios (
  usuario_id              INTEGER PRIMARY KEY AUTOINCREMENT,
  numero_whatsapp         TEXT    NOT NULL UNIQUE,

  -- Consentimento: dado de saúde sensível, LGPD se aplica.
  consentimento_aceito    INTEGER NOT NULL DEFAULT 0,
  consentimento_versao    TEXT,
  consentimento_timestamp TEXT,

  personalidade           TEXT    CHECK (personalidade IN ('direto', 'caloroso', 'neutro')),

  anamnese_estado         INTEGER NOT NULL DEFAULT 0
                                  CHECK (anamnese_estado BETWEEN 0 AND 12),

  -- Pausa: suspende os disparos SEM alterar a configuracao dos gatilhos.
  -- E filtro em listarGatilhosAtivos, nao desativacao individual: desativar
  -- cada gatilho perderia a informacao de quais estavam ativos por decisao do
  -- operador, e despausar restauraria o estado errado.
  pausado                 INTEGER NOT NULL DEFAULT 0,

  -- Controle da anamnese.
  -- `anamnese_exemplo_pedido` é o flag de UMA tentativa extra no estado corrente:
  -- serve tanto para o pedido de exemplo concreto (resposta vaga) quanto para a
  -- repergunta de personalidade no estado 10. É zerado a cada transição de estado.
  anamnese_ultima_mensagem_em TEXT,
  anamnese_lembrete_enviado   INTEGER NOT NULL DEFAULT 0,
  anamnese_exemplo_pedido     INTEGER NOT NULL DEFAULT 0,

  -- Um campo por resposta da anamnese.
  -- rotina_boa e rotina_ruim existem separados de propósito: no MVP o estado 3
  -- pede as duas coisas numa mensagem só e tudo cai em rotina_boa. A coluna
  -- rotina_ruim já existe para que separar depois não exija migração.
  -- Segundo fator da entrada pelo canal web. ANULÁVEL de propósito: participante
  -- cadastrado antes desta coluna não tem o dado, e inventá-lo seria dado falso.
  -- Sem ela a pessoa não entra pela web até o operador preencher — o que é
  -- recusa de acesso, não perda de dado.
  data_nascimento         TEXT,

  nome                    TEXT,
  o_que_trava             TEXT,
  rotina_boa              TEXT,
  rotina_ruim             TEXT,
  gatilhos_de_sobrecarga  TEXT,
  sinal_de_alerta         TEXT,
  pessoas_chave           TEXT,
  vocabulario_proprio     TEXT,
  nunca_fazer             TEXT,

  criado_em               TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS remedios (
  remedio_id  INTEGER PRIMARY KEY AUTOINCREMENT,
  usuario_id  INTEGER NOT NULL REFERENCES usuarios(usuario_id) ON DELETE CASCADE,
  -- Regra 1b: nome ou horário não informado é gravado como 'sem informação'
  -- (constante SEM_INFORMACAO), NUNCA como um chute.
  nome        TEXT    NOT NULL,
  horario     TEXT    NOT NULL,
  criado_em   TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS gatilhos_configurados (
  gatilho_id  INTEGER PRIMARY KEY AUTOINCREMENT,
  usuario_id  INTEGER NOT NULL REFERENCES usuarios(usuario_id) ON DELETE CASCADE,
  tipo        TEXT    NOT NULL
                      CHECK (tipo IN ('checkin_manha', 'remedio', 'checklist_fim_dia')),
  horario     TEXT    NOT NULL,
  ativo       INTEGER NOT NULL DEFAULT 1,
  -- Só preenchido quando tipo = 'remedio'.
  remedio_id  INTEGER REFERENCES remedios(remedio_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS contadores (
  usuario_id           INTEGER NOT NULL REFERENCES usuarios(usuario_id) ON DELETE CASCADE,
  gatilho_tipo         TEXT    NOT NULL
                               CHECK (gatilho_tipo IN ('checkin_manha', 'remedio', 'checklist_fim_dia')),
  silencio_consecutivo INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (usuario_id, gatilho_tipo)
);

CREATE TABLE IF NOT EXISTS despejos_semana (
  usuario_id    INTEGER PRIMARY KEY REFERENCES usuarios(usuario_id) ON DELETE CASCADE,
  -- Data (YYYY-MM-DD) da segunda-feira que abre a semana corrente.
  semana_inicio TEXT    NOT NULL,
  contagem      INTEGER NOT NULL DEFAULT 0
);

-- Log append-only. Nada aqui é atualizado nem apagado.
CREATE TABLE IF NOT EXISTS historico_interacoes (
  interacao_id        INTEGER PRIMARY KEY AUTOINCREMENT,
  usuario_id          INTEGER NOT NULL REFERENCES usuarios(usuario_id) ON DELETE CASCADE,
  tipo                TEXT    NOT NULL
                              CHECK (tipo IN ('gatilho_disparado', 'resposta_gatilho',
                                              'despejo_espontaneo', 'silencio',
                                              'correcao_reportada', 'anamnese',
                                              'acao_admin')),
  timestamp           TEXT    NOT NULL,
  texto               TEXT,
  -- Tipo do gatilho a que esta linha se refere (disparo, resposta ou silêncio).
  gatilho_relacionado TEXT,
  -- Por onde a mensagem chegou. NOT NULL com padrão: toda linha anterior a esta
  -- coluna veio do WhatsApp, e anulável obrigaria cada consulta a tratar o nulo.
  canal               TEXT    NOT NULL DEFAULT 'whatsapp'
                              CHECK (canal IN ('whatsapp', 'web'))
);

CREATE INDEX IF NOT EXISTS idx_historico_usuario_timestamp
  ON historico_interacoes (usuario_id, timestamp);

-- Estado da conexao com o WhatsApp, publicado pelo processo do bot e lido pelo
-- admin. Os dois sao containers separados que compartilham APENAS o volume do
-- banco -- nao ha memoria, socket nem evento em comum.
--
-- O CHECK (id = 1) e o que garante linha unica no BANCO, nao na convencao.
CREATE TABLE IF NOT EXISTS estado_conexao (
  id                INTEGER PRIMARY KEY CHECK (id = 1),
  conectado         INTEGER NOT NULL DEFAULT 0,
  -- Texto BRUTO do QR, nao a imagem: quem renderiza e o admin.
  qr_atual          TEXT,
  motivo_desconexao TEXT,
  atualizado_em     TEXT NOT NULL
);

-- Contas do backend administrativo. Nada aqui e dado de participante: e a
-- equipe que opera o piloto.
--
-- Conta se DESATIVA, nao se apaga: a auditoria precisa continuar podendo nomear
-- o autor de acoes passadas.
CREATE TABLE IF NOT EXISTS admin_usuarios (
  admin_id        INTEGER PRIMARY KEY AUTOINCREMENT,
  nome            TEXT    NOT NULL,
  email           TEXT    NOT NULL UNIQUE COLLATE NOCASE,
  -- Formato autodescritivo: scrypt$N$r$p$salt$hash. Trocar de parametros
  -- depois nao invalida o que ja existe.
  senha_hash      TEXT    NOT NULL,
  ativo           INTEGER NOT NULL DEFAULT 1,
  -- Senha temporaria pendente de troca. Enquanto valer 1, a sessao dessa conta
  -- so alcanca a tela de troca de senha: sem isso a "obrigacao" vira sugestao e
  -- uma senha gerada por terceiro continua valendo indefinidamente.
  precisa_trocar_senha INTEGER NOT NULL DEFAULT 0,
  criado_em       TEXT    NOT NULL DEFAULT (datetime('now')),
  ultimo_login_em TEXT
);

-- Auditoria das acoes sobre a EQUIPE (criar, desativar, resetar senha).
--
-- Tabela separada de historico_interacoes de proposito: la o usuario_id e
-- obrigatorio e referencia um participante, e criar um administrador nao tem
-- participante associado. Tornar aquela coluna anulavel enfraqueceria a FK e
-- quebraria a premissa de toda consulta existente, que assume a linha do tempo
-- de uma pessoa. A divisao e semantica: quem abre a pagina de um participante
-- quer o que aconteceu com ELE.
--
-- Append-only, como o outro log.
CREATE TABLE IF NOT EXISTS auditoria_admin (
  auditoria_id INTEGER PRIMARY KEY AUTOINCREMENT,
  -- Quem agiu. Sem ON DELETE: conta se desativa, nunca se apaga.
  autor_id     INTEGER REFERENCES admin_usuarios(admin_id),
  -- Conta afetada, quando houver.
  alvo_id      INTEGER REFERENCES admin_usuarios(admin_id),
  acao         TEXT    NOT NULL
                       CHECK (acao IN ('criou', 'desativou', 'reativou',
                                       'resetou_senha', 'trocou_propria_senha',
                                       'entrou', 'configurou_credencial')),
  descricao    TEXT    NOT NULL,
  momento      TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_auditoria_admin_momento
  ON auditoria_admin (momento);

-- Sessões do canal web.
--
-- ÚNICA tabela do projeto de onde apagar é o comportamento correto. Credencial
-- vencida não prova nada e, mantida, só aumenta o que vaza junto num backup. O
-- rastro de que a pessoa entrou fica em historico_interacoes, que ninguém apaga.
--
-- Guarda o HASH do token, nunca o valor: quem ler o banco não consegue se passar
-- por ninguém. Mesmo princípio da senha do operador.
CREATE TABLE IF NOT EXISTS sessoes_web (
  sessao_id  INTEGER PRIMARY KEY AUTOINCREMENT,
  token_hash TEXT    NOT NULL UNIQUE,
  usuario_id INTEGER NOT NULL REFERENCES usuarios(usuario_id) ON DELETE CASCADE,
  criado_em  TEXT    NOT NULL DEFAULT (datetime('now')),
  expira_em  TEXT    NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_sessoes_web_expira ON sessoes_web (expira_em);
