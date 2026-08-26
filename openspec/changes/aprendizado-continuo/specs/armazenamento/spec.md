## ADDED Requirements

### Requirement: Notas de perfil aprendidas fora da anamnese

O sistema SHALL manter uma tabela `notas_aprendidas` com: o participante, o campo, o
texto da nota, a referência à interação de origem, o momento de criação, e o par de
colunas que registra a remoção — momento e autor.

A coluna `campo` SHALL ter CHECK fechado com os campos elegíveis.

A referência ao participante SHALL ter exclusão em cascata, como as demais tabelas
filhas de `usuarios`. A referência ao autor da remoção SHALL NOT ter cascata — conta de
administrador se desativa, nunca se apaga.

A tabela SHALL ter índice composto em participante mais campo.

Remoção SHALL ser sempre lógica: o sistema SHALL NOT apagar linha de nota, exceto pelo
reinício de anamnese descrito abaixo.

#### Scenario: Campo inválido rejeitado pelo banco
- **WHEN** uma escrita tenta gravar nota com campo fora da lista elegível
- **THEN** o banco rejeita a linha

#### Scenario: Nota removida continua existindo
- **WHEN** uma nota é removida pelo operador
- **THEN** a linha permanece na tabela, com momento e autor da remoção preenchidos

### Requirement: Reinício de anamnese leva as notas junto

O reinício de anamnese SHALL apagar as notas aprendidas daquele participante.

O reinício SHALL NOT tocar em `historico_interacoes`.

Motivo registrado: reiniciar existe para a pessoa responder tudo de novo. Notas
construídas sobre o perfil velho contaminariam o novo — é o mesmo motivo pelo qual
remédios e gatilhos já são apagados ali. O rastro de que as notas existiram continua
nas linhas do histórico, que ninguém apaga.

#### Scenario: Reinício limpa as notas
- **WHEN** a anamnese de um participante é reiniciada
- **THEN** ele não tem mais nota aprendida, e as linhas de histórico correspondentes
  continuam lá

## MODIFIED Requirements

### Requirement: Histórico append-only

`historico_interacoes` SHALL restringir `tipo` a `gatilho_disparado`,
`resposta_gatilho`, `despejo_espontaneo`, `silencio`, `correcao_reportada`, `anamnese`,
`acao_admin` e `aprendizado_perfil`.

A tabela SHALL ter índice composto em `usuario_id` mais `timestamp`.

Linhas SHALL ser acrescentadas e nunca sobrescritas, com uma única exceção: a
anonimização de participante, que redige o campo `texto` conforme a capacidade de
anonimização abaixo.

A ampliação da lista de tipos em banco já existente SHALL ser feita por migração que
recria a tabela com a constraint atualizada, dentro de transação e com as chaves
estrangeiras desligadas, conferindo a contagem de linhas antes e depois.

A migração SHALL ser idempotente e SHALL NOT rodar quando a constraint já contiver o
tipo.

Motivo registrado: `CREATE TABLE IF NOT EXISTS` não altera tabela existente e o
`ALTER TABLE` do SQLite não mexe em CHECK. Recriar o volume deixou de ser saída assim
que o WhatsApp for pareado — a sessão vive no mesmo volume e reparear exige o chip em
mãos. Sem desligar as chaves estrangeiras, o `DROP` da tabela antiga dispararia CASCADE
sobre as filhas.

#### Scenario: Interação registrada
- **WHEN** qualquer interação relevante ocorre
- **THEN** uma linha é acrescentada ao histórico com tipo, timestamp e texto, sem
  sobrescrever linha anterior

#### Scenario: Ação de admin é um tipo válido
- **WHEN** uma ação de escrita do operador é registrada
- **THEN** o banco aceita o tipo `acao_admin`

#### Scenario: Aprendizado de perfil é um tipo válido
- **WHEN** o sistema registra que aprendeu algo novo sobre um participante
- **THEN** o banco aceita o tipo `aprendizado_perfil`

#### Scenario: Migração preserva o histórico
- **WHEN** a migração da constraint roda sobre um banco com interações já gravadas
- **THEN** a contagem de linhas depois é idêntica à de antes, e o índice composto
  continua existindo

#### Scenario: Migração já aplicada não roda de novo
- **WHEN** o banco abre com a constraint já atualizada
- **THEN** nenhuma recriação de tabela acontece

### Requirement: Anonimização de participante

O sistema SHALL oferecer a anonimização de participante como forma de saída do piloto,
e SHALL NOT oferecer exclusão física do registro.

A anonimização SHALL substituir por marcador redigido: o número de WhatsApp, todos os
campos de anamnese, o nome e o horário de cada remédio, o campo `texto` de todas as
interações daquele participante, e o texto de todas as notas aprendidas dele —
removidas ou não.

A anonimização SHALL preservar, em cada interação, o tipo, o timestamp e o gatilho
relacionado.

A anonimização SHALL marcar o participante como pausado.

O marcador de redação SHALL ser distinto da constante que indica ausência de
informação.

Motivo registrado: `historico_interacoes` tem exclusão em cascata a partir de
`usuarios`. Apagar o participante levaria junto o registro de consentimento — com
timestamp e versão — e o rastro das ações do operador sobre o dado dele, que é
justamente a prova exigida numa auditoria. O campo `texto` precisa ser redigido porque
guarda respostas escritas pela própria pessoa, frequentemente com nome e detalhes de
saúde. O texto das notas entra pelo mesmo motivo: é conteúdo escrito pela pessoa,
recortado da conversa. Redigir tudo menos as notas seria fachada. Confundir o marcador
de redação com o sentinela de ausência afirmaria que a pessoa nunca informou algo que
ela informou.

#### Scenario: Identificação removida, estrutura preservada
- **WHEN** um participante é anonimizado
- **THEN** número, campos de anamnese, remédios, textos de interação e textos de notas
  aprendidas ficam redigidos, e as linhas do histórico continuam existindo com tipo e
  timestamp

#### Scenario: Consentimento continua comprovável
- **WHEN** um participante é anonimizado
- **THEN** o registro de que houve consentimento, com timestamp e versão, permanece

#### Scenario: Redação não se confunde com ausência
- **WHEN** um remédio informado é redigido pela anonimização
- **THEN** o valor gravado difere da constante que indica ausência de informação

#### Scenario: Nota já removida também é redigida
- **WHEN** um participante com nota removida é anonimizado
- **THEN** o texto daquela nota também fica redigido
