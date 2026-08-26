## ADDED Requirements

### Requirement: Sessões do canal web em tabela própria

O sistema SHALL manter a tabela `sessoes_web` com: o hash do token, o participante, o
momento de criação e o momento de expiração.

A referência ao participante SHALL ter exclusão em cascata, como as demais tabelas
filhas de `usuarios`.

A tabela SHALL NOT guardar o token em forma utilizável.

Linhas expiradas SHALL ser removidas, e essa remoção SHALL NOT ser tratada como perda
de rastro de auditoria.

Motivo registrado: é a única tabela do projeto de onde apagar é o comportamento
correto. Credencial vencida não prova nada e, mantida, só aumenta o que vaza junto num
backup. O rastro de que a pessoa entrou fica em `historico_interacoes`, que ninguém
apaga.

#### Scenario: Token não recuperável
- **WHEN** a tabela de sessões é lida diretamente
- **THEN** nenhum token utilizável é obtido

#### Scenario: Cascata a partir do participante
- **WHEN** um participante é removido do banco
- **THEN** suas sessões desaparecem junto

### Requirement: Colunas novas entram por migração, não por recriação

Acrescentar coluna a tabela já existente SHALL ser feito por script de migração
idempotente, verificando antes se a coluna já existe.

O sistema SHALL NOT exigir recriação do volume para acrescentar coluna.

Motivo registrado: `CREATE TABLE IF NOT EXISTS` não altera tabela existente, e recriar
o volume deixou de ser possível assim que o WhatsApp for pareado — a sessão vive no
mesmo volume. Diferente de alterar um CHECK, acrescentar coluna o SQLite faz com
`ALTER TABLE ... ADD COLUMN`, sem recriar a tabela.

#### Scenario: Banco existente ganha as colunas
- **WHEN** o sistema sobe sobre um banco criado antes destas colunas
- **THEN** as colunas passam a existir, com os dados anteriores preservados

#### Scenario: Migração já aplicada não roda de novo
- **WHEN** o sistema sobe com as colunas já presentes
- **THEN** nenhuma alteração de schema é executada

## MODIFIED Requirements

### Requirement: Nomes de coluna são contrato

Os nomes de coluna definidos no schema SHALL ser tratados como contrato entre módulos.
Renomear coluna SHALL ser tratado como mudança de spec, não como refatoração.

As tabelas SHALL ser: `usuarios`, `remedios`, `gatilhos_configurados`, `contadores`,
`despejos_semana`, `historico_interacoes`, `estado_conexao` e `sessoes_web`.

`usuarios` SHALL restringir `personalidade` aos valores `direto`, `caloroso` e `neutro`,
e manter um campo por resposta de anamnese, além dos campos de controle (última
mensagem, lembrete enviado, exemplo já pedido).

`usuarios` SHALL manter os campos `rotina_boa` e `rotina_ruim` existindo separadamente,
mesmo que no MVP a resposta inteira do estado 3 caia apenas em `rotina_boa`.

`usuarios` SHALL ter a coluna `pausado`, inteira, não nula, com padrão 0.

`usuarios` SHALL ter a coluna `data_nascimento`, textual e **anulável**, usada como
segundo fator da entrada pelo canal web.

`gatilhos_configurados` SHALL restringir `tipo` a `checkin_manha`, `remedio` e
`checklist_fim_dia`, e SHALL referenciar um remédio apenas quando `tipo` for `remedio`.

`contadores` SHALL usar `usuario_id` mais `gatilho_tipo` como chave primária composta.

Motivo registrado para a anulabilidade: participantes cadastrados antes desta coluna
não têm o dado, e inventá-lo seria dado falso. Quem não tem data registrada não entra
pela web até o operador preencher — o que é recusa de acesso, não perda de dado.

#### Scenario: Personalidade inválida é rejeitada
- **WHEN** uma escrita tenta gravar personalidade fora dos três valores permitidos
- **THEN** o banco rejeita a escrita

#### Scenario: Usuário novo nasce não pausado
- **WHEN** um usuário é criado
- **THEN** `pausado` vale 0

#### Scenario: Participante antigo sem data de nascimento
- **WHEN** um participante cadastrado antes desta coluna é lido
- **THEN** `data_nascimento` vem vazia, sem valor inventado

### Requirement: Histórico append-only

`historico_interacoes` SHALL restringir `tipo` a `gatilho_disparado`,
`resposta_gatilho`, `despejo_espontaneo`, `silencio`, `correcao_reportada`, `anamnese` e
`acao_admin`.

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

### Requirement: Anonimização de participante

O sistema SHALL oferecer a anonimização de participante como forma de saída do piloto,
e SHALL NOT oferecer exclusão física do registro.

A anonimização SHALL substituir por marcador redigido: o número de WhatsApp, todos os
campos de anamnese, a data de nascimento, o nome e o horário de cada remédio, e o campo
`texto` de todas as interações daquele participante.

A anonimização SHALL apagar todas as sessões web daquele participante.

A anonimização SHALL preservar, em cada interação, o tipo, o timestamp, o gatilho
relacionado e o canal.

A anonimização SHALL marcar o participante como pausado.

O marcador de redação SHALL ser distinto da constante que indica ausência de
informação.

Motivo registrado: `historico_interacoes` tem exclusão em cascata a partir de
`usuarios`. Apagar o participante levaria junto o registro de consentimento — com
timestamp e versão — e o rastro das ações do operador sobre o dado dele, que é
justamente a prova exigida numa auditoria. O campo `texto` precisa ser redigido porque
guarda respostas escritas pela própria pessoa, frequentemente com nome e detalhes de
saúde. A data de nascimento entra pelo mesmo motivo: é identificação direta. As sessões
são apagadas, e não redigidas, porque uma sessão viva depois da saída do piloto seria
acesso a um dado que a pessoa pediu para encerrar.

#### Scenario: Identificação removida, estrutura preservada
- **WHEN** um participante é anonimizado
- **THEN** número, data de nascimento, campos de anamnese, remédios e textos de
  interação ficam redigidos, e as linhas do histórico continuam existindo com tipo,
  timestamp e canal

#### Scenario: Consentimento continua comprovável
- **WHEN** um participante é anonimizado
- **THEN** o registro de que houve consentimento, com timestamp e versão, permanece

#### Scenario: Redação não se confunde com ausência
- **WHEN** um remédio informado é redigido pela anonimização
- **THEN** o valor gravado difere da constante que indica ausência de informação

#### Scenario: Acesso pela web cessa imediatamente
- **WHEN** um participante com sessão web ativa é anonimizado
- **THEN** a sessão deixa de existir e a requisição seguinte é recusada
