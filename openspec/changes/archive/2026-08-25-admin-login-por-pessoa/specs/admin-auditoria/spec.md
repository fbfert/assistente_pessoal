## MODIFIED Requirements

### Requirement: Texto legível descrevendo a mudança

O campo `texto` da linha de auditoria SHALL descrever em linguagem natural o que
mudou, identificando o alvo e, quando aplicável, o valor anterior e o novo.

O texto SHALL identificar **qual administrador** realizou a ação.

O registro SHALL NOT exigir estrutura serializada como JSON.

Motivo registrado: o restante do histórico também é texto livre, e um piloto de
cinco pessoas é lido por gente. Nomear o autor importa porque a alteração recai
sobre dado de saúde de pessoa identificada.

#### Scenario: Edição de campo descreve origem e destino
- **WHEN** o operador altera o campo `nome` de "Ana" para "Ana Paula"
- **THEN** o texto registrado identifica o campo, o valor anterior e o novo

#### Scenario: A linha de auditoria nomeia o autor
- **WHEN** um administrador autenticado executa qualquer ação de escrita
- **THEN** o texto registrado identifica qual administrador agiu

#### Scenario: Ação sobre gatilho identifica qual
- **WHEN** o operador desativa um gatilho de remédio das 07:00
- **THEN** o texto registrado identifica o tipo do gatilho e o horário
