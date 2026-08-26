## MODIFIED Requirements

### Requirement: Roteamento por estado de anamnese

Quando o estado de anamnese do usuário for menor que 12, o sistema SHALL rotear a mensagem para
o passo de anamnese.

Quando o estado for 12, o sistema SHALL classificar a mensagem, montar o system prompt da
persona e responder via LLM.

O sistema SHALL registrar a interação como `resposta_gatilho` ou `despejo_espontaneo` conforme
a classificação, incrementando o contador semanal quando for despejo.

Quando o estado for 12, o sistema SHALL disparar também a extração de aprendizado de
perfil, **em paralelo** com a chamada de resposta.

O envio da resposta SHALL NOT esperar o término da extração.

A gravação da nota e da respectiva linha de auditoria SHALL acontecer quando a extração
terminar, independentemente do resultado da chamada de resposta.

Falha da extração SHALL NOT alterar o retorno do tratamento da mensagem nem gerar
mensagem ao participante.

Motivo registrado: reconhecer no mesmo turno exigiria as duas chamadas em série,
dobrando o tempo até qualquer resposta do chat livre — inclusive nas mensagens que não
ensinam nada, que são a maioria. É a resposta rápida que sustenta a regra de ouro do
input mínimo; o reconhecimento aparece a partir da mensagem seguinte, dentro da mesma
conversa.

#### Scenario: Usuário em anamnese
- **WHEN** chega mensagem de usuário no estado 4
- **THEN** a mensagem é processada pela máquina de estados, não pelo fluxo de conversa normal,
  e nenhuma extração de aprendizado é disparada

#### Scenario: Despejo espontâneo contabilizado
- **WHEN** chega mensagem de usuário concluído, fora da janela de gatilho
- **THEN** a interação é registrada como `despejo_espontaneo` e o contador semanal é incrementado

#### Scenario: Resposta não espera a extração
- **WHEN** chega mensagem de usuário concluído e a extração demora mais que a resposta
- **THEN** a resposta é enviada assim que fica pronta, sem aguardar a extração

#### Scenario: Extração falha, conversa segue
- **WHEN** a chamada de extração lança erro
- **THEN** o participante recebe a resposta normalmente e nenhuma nota é criada
