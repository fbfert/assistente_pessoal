## MODIFIED Requirements

### Requirement: Gatilhos só para anamnese concluída

A listagem de gatilhos ativos SHALL considerar apenas usuários com anamnese no estado
12 e que não estejam pausados.

Pausar um usuário SHALL suspender seus disparos sem alterar a configuração individual
de nenhum gatilho dele.

Motivo registrado: desativar cada gatilho ao pausar perderia a informação de quais
estavam ativos por decisão do operador, e despausar restauraria o estado errado. Um
filtro na consulta é reversível por construção.

#### Scenario: Usuário em onboarding não recebe gatilho
- **WHEN** um usuário está no estado 5 da anamnese no horário de um gatilho
- **THEN** nenhum gatilho é disparado para ele

#### Scenario: Usuário pausado não recebe gatilho
- **WHEN** um usuário com anamnese concluída e gatilhos ativos está pausado
- **THEN** nenhum gatilho é disparado para ele

#### Scenario: Despausar devolve os disparos originais
- **WHEN** um usuário pausado é despausado
- **THEN** volta a receber exatamente os gatilhos que estavam ativos antes da pausa
