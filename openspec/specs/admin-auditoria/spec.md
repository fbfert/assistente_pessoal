# admin-auditoria Specification

## Purpose

Deixar rastro de toda alteração que o operador faz sobre dado de saúde, no mesmo log
append-only onde já vive qualquer outra interação — sem tabela paralela e sem
ferramenta nova para consultar.

## Requirements

### Requirement: Toda ação de escrita é registrada

Toda rota de escrita do admin SHALL registrar exatamente uma linha em
`historico_interacoes` com `tipo = 'acao_admin'`, usando a função de registro já
existente.

O registro SHALL ocorrer mesmo quando a ação for disparada sobre um usuário que a
pessoa operadora acabou de criar.

#### Scenario: Uma ação, uma linha
- **WHEN** o operador executa qualquer ação de escrita
- **THEN** exatamente uma linha `acao_admin` é acrescentada ao histórico daquele usuário

#### Scenario: Leitura não gera auditoria
- **WHEN** o operador apenas visualiza a página de detalhe de um usuário
- **THEN** nenhuma linha `acao_admin` é criada

### Requirement: Texto legível descrevendo a mudança

O campo `texto` da linha de auditoria SHALL descrever em linguagem natural o que mudou,
identificando o alvo e, quando aplicável, o valor anterior e o novo.

O registro SHALL NOT exigir estrutura serializada como JSON.

Motivo registrado: o restante do histórico também é texto livre, e um piloto de cinco
pessoas é lido por gente, não por máquina.

#### Scenario: Edição de campo descreve origem e destino
- **WHEN** o operador altera o campo `nome` de "Ana" para "Ana Paula"
- **THEN** o texto registrado identifica o campo, o valor anterior e o novo

#### Scenario: Ação sobre gatilho identifica qual
- **WHEN** o operador desativa um gatilho de remédio das 07:00
- **THEN** o texto registrado identifica o tipo do gatilho e o horário

### Requirement: Auditoria sobrevive à saída do participante

O registro de auditoria de um participante SHALL permanecer legível após ele deixar o
piloto, preservando tipo, timestamp e gatilho relacionado.

#### Scenario: Rastro preservado após anonimização
- **WHEN** um participante é anonimizado
- **THEN** as linhas `acao_admin` do histórico dele continuam existindo, com tipo e
  timestamp intactos, sem conteúdo identificável
