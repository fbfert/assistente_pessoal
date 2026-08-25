## Purpose

Guardar o estado do piloto — usuários, anamnese, remédios, gatilhos, contadores e o log de
interações — em SQLite estruturado, com nomes de coluna estáveis dos quais os outros módulos
dependem.

## ADDED Requirements

### Requirement: SQLite estruturado como armazenamento

O sistema SHALL persistir em SQLite, com WAL habilitado e `foreign_keys=on`, abrindo a conexão
como singleton e executando o schema na primeira abertura.

O sistema SHALL NOT usar banco vetorial.

Motivo registrado: na escala de 5 pessoas o banco vetorial não muda a segurança e adiciona
complexidade sem retorno.

#### Scenario: Primeira abertura cria o schema
- **WHEN** o banco é aberto e o arquivo ainda não existe
- **THEN** o schema é criado e a conexão volta com WAL e chaves estrangeiras ativas

### Requirement: Nomes de coluna são contrato

Os nomes de coluna definidos no schema SHALL ser tratados como contrato entre módulos.
Renomear coluna SHALL ser tratado como mudança de spec, não como refatoração.

As tabelas SHALL ser: `usuarios`, `remedios`, `gatilhos_configurados`, `contadores`,
`despejos_semana` e `historico_interacoes`.

`usuarios` SHALL restringir `personalidade` aos valores `direto`, `caloroso` e `neutro`, e
manter um campo por resposta de anamnese, além dos campos de controle (última mensagem,
lembrete enviado, exemplo já pedido).

`usuarios` SHALL manter os campos `rotina_boa` e `rotina_ruim` existindo separadamente, mesmo
que no MVP a resposta inteira do estado 3 caia apenas em `rotina_boa`.

`gatilhos_configurados` SHALL restringir `tipo` a `checkin_manha`, `remedio` e
`checklist_fim_dia`, e SHALL referenciar um remédio apenas quando `tipo` for `remedio`.

`contadores` SHALL usar `usuario_id` mais `gatilho_tipo` como chave primária composta.

#### Scenario: Personalidade inválida é rejeitada
- **WHEN** uma escrita tenta gravar personalidade fora dos três valores permitidos
- **THEN** o banco rejeita a escrita

### Requirement: Histórico append-only

`historico_interacoes` SHALL ser append-only e restringir `tipo` a `gatilho_disparado`,
`resposta_gatilho`, `despejo_espontaneo`, `silencio`, `correcao_reportada` e `anamnese`.

A tabela SHALL ter índice composto em `usuario_id` mais `timestamp`.

#### Scenario: Interação registrada
- **WHEN** qualquer interação relevante ocorre
- **THEN** uma linha é acrescentada ao histórico com tipo, timestamp e texto, sem sobrescrever
  linha anterior

### Requirement: Criação idempotente de usuário

A busca-ou-criação de usuário por número de WhatsApp SHALL ser idempotente: chamadas repetidas
com o mesmo número SHALL retornar o mesmo usuário, sem duplicar linha.

O número de WhatsApp SHALL ser único.

#### Scenario: Convite repetido não duplica
- **WHEN** a busca-ou-criação é chamada duas vezes com o mesmo número
- **THEN** o mesmo `usuario_id` é retornado nas duas chamadas

### Requirement: Contador semanal de despejo

O contador de despejo espontâneo SHALL ser mantido por usuário e por semana, e SHALL zerar na
virada de semana, contando a semana a partir de segunda-feira.

#### Scenario: Virada de semana zera a contagem
- **WHEN** um despejo é registrado e a semana corrente é diferente da armazenada
- **THEN** a contagem reinicia em 1 e o início da semana é atualizado

### Requirement: Contadores de silêncio

O sistema SHALL manter, por usuário e por tipo de gatilho, um contador de silêncios
consecutivos, com operações de leitura, incremento e zeragem, gravando por upsert.

#### Scenario: Resposta zera o contador
- **WHEN** o usuário responde a um gatilho de um tipo cujo contador estava em 2
- **THEN** o contador daquele tipo volta a 0
