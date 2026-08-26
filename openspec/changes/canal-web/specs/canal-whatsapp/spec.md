## MODIFIED Requirements

### Requirement: Roteamento por estado de anamnese

O roteamento SHALL ser responsabilidade do núcleo de conversa, e SHALL valer
igualmente para qualquer canal.

Quando o estado de anamnese do usuário for menor que 12, o sistema SHALL rotear a mensagem para
o passo de anamnese.

Quando o estado for 12, o sistema SHALL classificar a mensagem, montar o system prompt da
persona e responder via LLM.

O sistema SHALL registrar a interação como `resposta_gatilho` ou `despejo_espontaneo` conforme
a classificação, incrementando o contador semanal quando for despejo, e SHALL registrar o
canal de origem em qualquer caso.

O adaptador do WhatsApp SHALL NOT reimplementar esse roteamento.

Motivo registrado: enquanto a decisão viver dentro do adaptador, acrescentar um canal
significa copiá-la — e a partir da primeira cópia as duas divergem em silêncio, cada
correção valendo só para um lado.

#### Scenario: Usuário em anamnese
- **WHEN** chega mensagem de usuário no estado 4
- **THEN** a mensagem é processada pela máquina de estados, não pelo fluxo de conversa normal

#### Scenario: Despejo espontâneo contabilizado
- **WHEN** chega mensagem de usuário concluído, fora da janela de gatilho
- **THEN** a interação é registrada como `despejo_espontaneo` e o contador semanal é incrementado

#### Scenario: Mesma decisão nos dois canais
- **WHEN** a mesma mensagem chega pelo WhatsApp e pela web, para o mesmo participante no
  mesmo estado
- **THEN** o roteamento é idêntico

### Requirement: Filtro de origem de mensagem

O sistema SHALL ignorar mensagens enviadas pelo próprio bot e mensagens de grupo, processando
apenas conversa individual recebida.

Esse filtro SHALL permanecer no adaptador do WhatsApp e SHALL NOT ser levado para o
núcleo de conversa.

Motivo registrado: é comportamento de transporte — grupo e eco do próprio remetente são
conceitos do WhatsApp, sem equivalente num canal onde a identidade vem de uma sessão.

#### Scenario: Mensagem de grupo ignorada
- **WHEN** chega mensagem de um grupo
- **THEN** nada é processado nem registrado

#### Scenario: Eco do próprio bot ignorado
- **WHEN** chega no fluxo uma mensagem marcada como enviada pelo próprio bot
- **THEN** ela é descartada

### Requirement: Rede de segurança para mensagem fora de fluxo

Quando chegar mensagem de alguém sem anamnese iniciada, o sistema SHALL devolver o texto de
consentimento e aguardar.

Esse caminho SHALL ser tratado como rede de segurança, não como o fluxo pretendido.

Essa rede de segurança SHALL permanecer no adaptador do WhatsApp e SHALL NOT ser
generalizada para outros canais.

Motivo registrado: no canal web não existe mensagem de remetente desconhecido — quem não
tem sessão válida é recusado antes de qualquer processamento, e criar participante ali
seria autocadastro num sistema que guarda dado de saúde.

#### Scenario: Mensagem de desconhecido
- **WHEN** chega mensagem de um número sem usuário ou com estado de anamnese ausente
- **THEN** o sistema responde com o texto de consentimento

#### Scenario: Sem equivalente na web
- **WHEN** uma requisição web chega sem sessão válida
- **THEN** é recusada, e nenhum participante é criado
