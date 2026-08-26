## MODIFIED Requirements

### Requirement: Agregações de acompanhamento

O dashboard SHALL agregar, por usuário: despejos espontâneos da semana, silêncios por tipo de
gatilho, correções reportadas e o funil de check-in.

O dashboard SHALL marcar um usuário com alerta de sobrecarga quando qualquer contador de
silêncios consecutivos dele atingir o limite configurado.

As correções reportadas SHALL ser exibidas em destaque, com link direto para a página do
participante que a reportou.

Motivo registrado: correção reportada é a única coisa no painel que representa alguém
esperando uma ação humana. Listada sem destaque e sem link, ela é anotação que ninguém
abre.

#### Scenario: Alerta de sobrecarga
- **WHEN** um usuário tem silêncio consecutivo igual ao limite configurado em qualquer tipo de
  gatilho
- **THEN** ele aparece marcado com alerta de sobrecarga

#### Scenario: Correção reportada leva ao participante
- **WHEN** existe correção reportada
- **THEN** ela aparece em destaque no painel, com link para a página de quem reportou
