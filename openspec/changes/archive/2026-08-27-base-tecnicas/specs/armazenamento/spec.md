## MODIFIED Requirements

### Requirement: Histórico append-only

`historico_interacoes` SHALL restringir `tipo` a `gatilho_disparado`,
`resposta_gatilho`, `despejo_espontaneo`, `silencio`, `correcao_reportada`, `anamnese`,
`acao_admin`, `entrada_web`, `mensagem_enviada`, `resposta_bloqueada_seguranca`, `aprendizado_perfil` e `tecnica_sugerida`.

A ampliação dessa lista em banco já existente SHALL ser feita por migração que recria a
tabela com a constraint atualizada, dentro de transação e com as chaves estrangeiras
desligadas, conferindo a contagem de linhas antes e depois, e SHALL ser idempotente.

`entrada_web` SHALL registrar acesso da própria pessoa, e SHALL NOT ser confundido com
`acao_admin`, que registra escrita do operador sobre ela.

`mensagem_enviada` SHALL registrar toda mensagem que o sistema envia numa conversa —
pergunta de anamnese e resposta de chat livre —, com o canal por onde saiu. Disparo de
gatilho SHALL continuar sendo registrado apenas como `gatilho_disparado`.

`aprendizado_perfil` SHALL registrar o que o sistema aprendeu sobre o participante fora
da anamnese, e SHALL NOT ser confundido com `acao_admin`: um é evento do bot, o outro é
escrita do operador.

`tecnica_sugerida` SHALL registrar que uma técnica da base foi injetada no contexto de
uma resposta, guardando o identificador e o título da técnica. Esse registro SHALL
descrever a INJEÇÃO no contexto, e SHALL NOT ser lido como prova de que a resposta
entregue continha aquela técnica — o sistema sabe o que ofereceu ao modelo, não o que o
modelo usou.

`resposta_bloqueada_seguranca` SHALL registrar resposta que o sistema recusou enviar,
guardando o texto que teria sido entregue. Esse texto SHALL NOT ser descartado: sem ele
não há como responder quantas vezes o modelo tentou.

Motivo registrado: sem isso, metade da conversa não existe. Num piloto que existe para
avaliar a qualidade do que o assistente diz, falta exatamente o lado que importa — e
não há como investigar se ele confirmou algo que não fez.

Linhas cujo tipo não representa mensagem — como `acao_admin` — SHALL carregar o valor
padrão de `canal`, e a interface SHALL NOT exibir canal para elas.

`historico_interacoes` SHALL ter a coluna `canal`, restrita a `whatsapp` e `web`, não
nula, com padrão `whatsapp`.

A tabela SHALL ter índice composto em `usuario_id` mais `timestamp`.

Linhas SHALL ser acrescentadas e nunca sobrescritas, com uma única exceção: a
anonimização de participante, que redige o campo `texto` conforme a capacidade de
anonimização abaixo.

Motivo registrado para o padrão: toda linha que já existe veio do WhatsApp, e deixar a
coluna anulável obrigaria cada consulta a tratar o caso do nulo para sempre.

#### Scenario: Interação registrada
- **WHEN** qualquer interação relevante ocorre
- **THEN** uma linha é acrescentada ao histórico com tipo, timestamp, texto e canal, sem
  sobrescrever linha anterior

#### Scenario: Ação de admin é um tipo válido
- **WHEN** uma ação de escrita do operador é registrada
- **THEN** o banco aceita o tipo `acao_admin`

#### Scenario: Linha antiga vale como WhatsApp
- **WHEN** o histórico anterior a esta mudança é lido
- **THEN** todas as linhas aparecem como do canal `whatsapp`

#### Scenario: Canal desconhecido é rejeitado
- **WHEN** uma escrita tenta gravar um canal fora dos valores permitidos
- **THEN** o banco rejeita a escrita

#### Scenario: Entrada pela web é um tipo válido
- **WHEN** uma entrada pelo canal web é registrada
- **THEN** o banco aceita o tipo `entrada_web`

#### Scenario: Migração da lista de tipos preserva o histórico
- **WHEN** a migração roda sobre um banco com interações já gravadas
- **THEN** a contagem de linhas depois é idêntica à de antes, e o índice composto
  continua existindo

#### Scenario: Ação de admin não exibe canal
- **WHEN** a página do participante mostra uma linha de `acao_admin`
- **THEN** nenhum canal é exibido para ela

#### Scenario: A resposta do sistema fica registrada
- **WHEN** o sistema responde a uma mensagem do participante
- **THEN** uma linha `mensagem_enviada` é acrescentada com o texto enviado e o canal

#### Scenario: Envio que falha não vira registro
- **WHEN** o envio de uma resposta falha
- **THEN** nenhuma linha `mensagem_enviada` é gravada para ela

#### Scenario: Resposta recusada fica registrada com o texto
- **WHEN** o sistema bloqueia uma resposta por segurança
- **THEN** uma linha `resposta_bloqueada_seguranca` guarda o texto que seria enviado

#### Scenario: Aprendizado de perfil é um tipo válido
- **WHEN** o sistema registra que aprendeu algo novo sobre um participante
- **THEN** o banco aceita o tipo `aprendizado_perfil`

#### Scenario: Técnica sugerida é um tipo válido
- **WHEN** o sistema injeta uma técnica no contexto de uma resposta
- **THEN** o banco aceita o tipo `tecnica_sugerida`

#### Scenario: O registro não afirma entrega
- **WHEN** uma linha `tecnica_sugerida` é exibida
- **THEN** ela descreve a técnica oferecida ao modelo, não a técnica entregue à pessoa

## ADDED Requirements

### Requirement: Temas em tabela própria

O banco SHALL ter tabela `temas_tecnicas` com chave única, rótulo e as
palavras-gatilho do tema.

As palavras-gatilho SHALL ser guardadas em coluna de texto, uma expressão por
linha, e SHALL NOT ter tabela filha.

Motivo registrado para o formato: a lista é sempre lida inteira e nunca
consultada por elemento, então tabela filha só acrescentaria CRUD, ordenação e
deduplicação para nada. Uma expressão por linha, e não JSON, porque quem edita é
um operador num `<textarea>` sem JavaScript — pedir JSON válido a mão é
transformar vírgula esquecida em erro de sistema.

A expressão SHALL ser guardada como digitada, e a normalização SHALL acontecer
na leitura.

#### Scenario: Palavras-gatilho vazias são aceitas
- **WHEN** um tema é criado sem nenhuma palavra-gatilho
- **THEN** ele existe, e simplesmente nunca é identificado pela classificação

#### Scenario: A expressão é guardada como digitada
- **WHEN** o operador digita uma expressão com acento e maiúscula
- **THEN** ela reaparece no formulário exatamente como foi digitada

### Requirement: Técnicas práticas em tabela própria

O banco SHALL ter tabela `tecnicas` com identificador, título, texto, tema,
fonte, status, instante da última sugestão, e o administrador e o instante da
aprovação.

`tema` SHALL referenciar `temas_tecnicas`, e escrita com tema inexistente SHALL
ser recusada.

`status` SHALL ser restrito por CHECK a `rascunho`, `publicada` e `arquivada`,
com padrão `rascunho`.

`aprovado_por` SHALL referenciar `admin_usuarios`, e SHALL ser nulo enquanto a
técnica não tiver sido publicada.

`ultima_sugerida_em` SHALL ser nulo até a primeira sugestão, e o rodízio SHALL
tratar o nulo como o valor mais antigo possível.

A tabela SHALL ter índice em `tema` mais `status`, que é o par de toda consulta
da conversa.

#### Scenario: Tema inexistente é rejeitado
- **WHEN** uma escrita tenta gravar técnica com tema que não está em `temas_tecnicas`
- **THEN** a escrita é recusada

#### Scenario: Status fora da lista é rejeitado pelo banco
- **WHEN** uma escrita tenta gravar status fora dos três valores
- **THEN** o banco rejeita a escrita

#### Scenario: Técnica nasce em rascunho
- **WHEN** uma técnica é criada sem status explícito
- **THEN** ela fica em `rascunho`, sem aprovador e sem instante de aprovação

### Requirement: As tabelas novas entram por migração

Em banco já existente, `temas_tecnicas` e `tecnicas` SHALL ser criadas pelo mesmo caminho das demais
tabelas, e a ampliação do CHECK de `historico_interacoes` SHALL usar o
procedimento de recriação com transação, chaves estrangeiras desligadas e
conferência da contagem de linhas antes e depois.

A migração SHALL ser idempotente.

#### Scenario: Banco existente ganha a tabela
- **WHEN** o sistema sobe sobre um banco anterior a esta mudança
- **THEN** as duas tabelas existem e nenhuma linha do histórico foi perdida

#### Scenario: Rodar duas vezes não muda nada
- **WHEN** a migração roda de novo sobre um banco já migrado
- **THEN** nada é alterado e nenhum erro é levantado
