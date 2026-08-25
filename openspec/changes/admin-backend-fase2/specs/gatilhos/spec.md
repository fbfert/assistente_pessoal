## MODIFIED Requirements

### Requirement: Gatilhos padrão na conclusão da anamnese

Ao concluir a anamnese, o sistema SHALL configurar:

- `checkin_manha` no horário padrão configurado, ativo;
- um gatilho `remedio` por remédio cadastrado que tenha nome **e** horário válidos;
- `checklist_fim_dia` no horário padrão configurado, com `ativo = 0`.

Os horários padrão SHALL vir da configuração viva, recaindo na constante do código
quando não configurados.

O sistema SHALL NOT criar gatilho para remédio cujo nome ou horário seja
`sem informação`, porque não há o que lembrar.

O `checklist_fim_dia` SHALL permanecer inativo por padrão, ativado apenas por
decisão manual.

Alterar um horário padrão SHALL NOT modificar gatilho já configurado de
participante existente.

#### Scenario: Remédio sem horário não vira gatilho
- **WHEN** um remédio cadastrado tem horário igual a `sem informação`
- **THEN** nenhum gatilho `remedio` é criado para ele

#### Scenario: Checklist nasce desligado
- **WHEN** a anamnese conclui
- **THEN** o `checklist_fim_dia` existe no horário padrão com `ativo = 0`

#### Scenario: Padrão novo vale só para quem vier depois
- **WHEN** o horário padrão do check-in é alterado
- **THEN** participantes já configurados mantêm o horário que tinham, e os que
  concluírem a anamnese a partir daí recebem o novo
