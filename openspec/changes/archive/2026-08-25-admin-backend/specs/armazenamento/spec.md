## MODIFIED Requirements

### Requirement: Nomes de coluna são contrato

Os nomes de coluna definidos no schema SHALL ser tratados como contrato entre módulos.
Renomear coluna SHALL ser tratado como mudança de spec, não como refatoração.

As tabelas SHALL ser: `usuarios`, `remedios`, `gatilhos_configurados`, `contadores`,
`despejos_semana`, `historico_interacoes` e `estado_conexao`.

`usuarios` SHALL restringir `personalidade` aos valores `direto`, `caloroso` e `neutro`,
e manter um campo por resposta de anamnese, além dos campos de controle (última
mensagem, lembrete enviado, exemplo já pedido).

`usuarios` SHALL manter os campos `rotina_boa` e `rotina_ruim` existindo separadamente,
mesmo que no MVP a resposta inteira do estado 3 caia apenas em `rotina_boa`.

`usuarios` SHALL ter a coluna `pausado`, inteira, não nula, com padrão 0.

`gatilhos_configurados` SHALL restringir `tipo` a `checkin_manha`, `remedio` e
`checklist_fim_dia`, e SHALL referenciar um remédio apenas quando `tipo` for `remedio`.

`contadores` SHALL usar `usuario_id` mais `gatilho_tipo` como chave primária composta.

#### Scenario: Personalidade inválida é rejeitada
- **WHEN** uma escrita tenta gravar personalidade fora dos três valores permitidos
- **THEN** o banco rejeita a escrita

#### Scenario: Usuário novo nasce não pausado
- **WHEN** um usuário é criado
- **THEN** `pausado` vale 0

### Requirement: Histórico append-only

`historico_interacoes` SHALL restringir `tipo` a `gatilho_disparado`,
`resposta_gatilho`, `despejo_espontaneo`, `silencio`, `correcao_reportada`, `anamnese` e
`acao_admin`.

A tabela SHALL ter índice composto em `usuario_id` mais `timestamp`.

Linhas SHALL ser acrescentadas e nunca sobrescritas, com uma única exceção: a
anonimização de participante, que redige o campo `texto` conforme a capacidade de
anonimização abaixo.

#### Scenario: Interação registrada
- **WHEN** qualquer interação relevante ocorre
- **THEN** uma linha é acrescentada ao histórico com tipo, timestamp e texto, sem
  sobrescrever linha anterior

#### Scenario: Ação de admin é um tipo válido
- **WHEN** uma ação de escrita do operador é registrada
- **THEN** o banco aceita o tipo `acao_admin`

## ADDED Requirements

### Requirement: Anonimização de participante

O sistema SHALL oferecer a anonimização de participante como forma de saída do piloto,
e SHALL NOT oferecer exclusão física do registro.

A anonimização SHALL substituir por marcador redigido: o número de WhatsApp, todos os
campos de anamnese, o nome e o horário de cada remédio, e o campo `texto` de todas as
interações daquele participante.

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
saúde. Confundir o marcador de redação com o sentinela de ausência afirmaria que a
pessoa nunca informou algo que ela informou.

#### Scenario: Identificação removida, estrutura preservada
- **WHEN** um participante é anonimizado
- **THEN** número, campos de anamnese, remédios e textos de interação ficam redigidos, e
  as linhas do histórico continuam existindo com tipo e timestamp

#### Scenario: Consentimento continua comprovável
- **WHEN** um participante é anonimizado
- **THEN** o registro de que houve consentimento, com timestamp e versão, permanece

#### Scenario: Redação não se confunde com ausência
- **WHEN** um remédio informado é redigido pela anonimização
- **THEN** o valor gravado difere da constante que indica ausência de informação

### Requirement: Espera por escrita concorrente

A abertura da conexão com o banco SHALL configurar um tempo de espera para bloqueio.

Motivo registrado: com o admin escrevendo, passam a existir dois processos escritores
sobre o mesmo arquivo SQLite. O WAL suporta o caso, mas sem tempo de espera uma
colisão vira erro imediato em vez de uma pausa de milissegundos.

#### Scenario: Escrita concorrente não falha de imediato
- **WHEN** admin e bot tentam escrever ao mesmo tempo
- **THEN** a segunda escrita aguarda o tempo configurado em vez de falhar na hora
