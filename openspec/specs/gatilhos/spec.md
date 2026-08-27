# gatilhos Specification

## Purpose

Disparar as três mensagens agendadas do MVP no horário certo e, principalmente, definir como o
sistema se comporta quando o usuário para de responder — o ponto onde um app de lembrete comum
piora a sobrecarga em vez de aliviá-la.

## Requirements

### Requirement: Três gatilhos fixos no MVP

O sistema SHALL suportar exatamente três tipos de gatilho: `checkin_manha`, `remedio` e
`checklist_fim_dia`.

Novos tipos SHALL ser desbloqueados por necessidade relatada no piloto, não por calendário.

#### Scenario: Tipo desconhecido é rejeitado
- **WHEN** uma configuração tenta gravar um tipo fora dos três
- **THEN** a escrita é rejeitada

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

### Requirement: Horário calculado em São Paulo

O agendamento SHALL calcular a hora corrente no fuso `America/Sao_Paulo` explicitamente, sem
depender do fuso do processo.

#### Scenario: Fuso do processo diverge
- **WHEN** o processo roda com fuso diferente de `America/Sao_Paulo`
- **THEN** os gatilhos disparam nos horários de São Paulo

### Requirement: Um disparo por tipo por dia

O sistema SHALL verificar o histórico antes de disparar e SHALL NOT disparar o mesmo tipo de
gatilho duas vezes no mesmo dia para o mesmo usuário.

Cada disparo SHALL ser registrado no histórico como `gatilho_disparado`.

#### Scenario: Reenvio no mesmo dia é suprimido
- **WHEN** o `checkin_manha` de um usuário já foi disparado hoje
- **THEN** nenhum novo `checkin_manha` é enviado a esse usuário hoje

### Requirement: Regra de silêncio reduz a exigência

Quando um gatilho disparado não receber resposta dentro da janela esperada, o sistema SHALL
registrar `silencio` no histórico e incrementar o contador de silêncios consecutivos daquele
tipo.

Quando houver resposta, o sistema SHALL zerar o contador daquele tipo.

Quando o contador de silêncios consecutivos de um tipo atingir o limite configurado (padrão 3),
a próxima mensagem desse tipo SHALL usar uma versão mais curta e menos exigente.

O sistema SHALL NOT intensificar a cobrança em função do silêncio.

Motivo registrado: pesquisa sobre crise neurodivergente indica que pergunta direta pode piorar
a sobrecarga. Quem está sumindo precisa de menos exigência, não de mais.

#### Scenario: Tom reduzido após três silêncios
- **WHEN** o contador de silêncios de `checkin_manha` de um usuário está em 3
- **THEN** o próximo `checkin_manha` desse usuário usa a versão curta da mensagem

#### Scenario: Resposta restaura o tom normal
- **WHEN** o usuário responde a um gatilho após dois silêncios
- **THEN** o contador daquele tipo volta a 0 e a próxima mensagem usa a versão normal

### Requirement: Enquadramento binário do check-in matinal

A mensagem de `checkin_manha` SHALL ser uma pergunta de escolha binária entre modo normal e
modo disfunção, e SHALL NOT ser uma pergunta aberta.

Motivo registrado: pergunta aberta demais pela manhã é mais custosa de responder para o
público-alvo.

#### Scenario: Check-in oferece duas opções
- **WHEN** o `checkin_manha` é montado
- **THEN** o texto apresenta duas opções explícitas em vez de uma pergunta aberta

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
