## ADDED Requirements

### Requirement: Aprendizado de perfil extraído em paralelo com a resposta

Para participante com anamnese concluída, o núcleo SHALL disparar a extração de
aprendizado de perfil **junto** com a chamada de resposta, na mesma execução paralela
em que a extração de remédio já roda.

O envio da resposta SHALL NOT esperar o término da extração de aprendizado.

A gravação da nota SHALL acontecer quando a extração terminar, independentemente do
resultado da chamada de resposta.

Falha da extração SHALL NOT alterar o retorno do tratamento da mensagem, SHALL NOT
impedir o envio da resposta e SHALL NOT gerar mensagem ao participante.

Este mecanismo SHALL NOT enviar mensagem alguma: o reconhecimento acontece pelo
contexto enriquecido das mensagens seguintes, não por texto próprio.

A extração SHALL rodar apenas no núcleo, e SHALL NOT ser reimplementada em nenhum
adaptador.

Motivo registrado: reconhecer no mesmo turno exigiria as duas chamadas em série,
dobrando o tempo até qualquer resposta do chat livre — inclusive nas mensagens que não
ensinam nada, que são a maioria. É a resposta rápida que sustenta a regra de ouro do
input mínimo. Como este mecanismo não envia nada, ele também não cruza a verificação de
segurança que examina a saída do modelo antes do envio.

#### Scenario: A resposta não espera o aprendizado
- **WHEN** chega mensagem de participante concluído e a extração demora mais que a
  resposta
- **THEN** a resposta é enviada assim que fica pronta, sem aguardar a extração

#### Scenario: Falha na extração não afeta a conversa
- **WHEN** a extração de aprendizado lança erro
- **THEN** o participante recebe a resposta normalmente e nenhuma nota é criada

#### Scenario: Nada é enviado por causa do aprendizado
- **WHEN** uma nota é criada a partir de uma mensagem
- **THEN** nenhuma mensagem adicional é enviada ao participante naquele turno

#### Scenario: A nota alcança a conversa seguinte
- **WHEN** o participante escreve de novo depois de uma nota ter sido criada
- **THEN** o system prompt daquela mensagem já contém a nota
