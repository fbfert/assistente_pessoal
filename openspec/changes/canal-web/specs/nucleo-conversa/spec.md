## Purpose

Garantir que exista **um** caminho de processamento de mensagem, exercitado por
qualquer canal, para que WhatsApp e web não virem dois produtos com a mesma marca.

## ADDED Requirements

### Requirement: Núcleo de conversa independente de canal

O sistema SHALL expor uma função única de processamento de mensagem que recebe: o
participante já identificado, o texto já em forma de texto, o identificador do canal
de origem, e uma função de envio de resposta.

O núcleo SHALL NOT conhecer o transporte: SHALL NOT receber número de WhatsApp como
identificador, SHALL NOT receber objeto de mensagem de biblioteca de terceiro, e
SHALL NOT importar módulo de canal.

O núcleo SHALL continuar aceitando dependências injetadas, para permitir teste sem
rede e sem SQLite real.

Motivo registrado: enquanto a decisão de roteamento viver dentro do adaptador do
WhatsApp, acrescentar um canal significa copiá-la — e a partir da primeira cópia as
duas divergem em silêncio, cada correção valendo só para um lado.

#### Scenario: Mesma decisão para canais diferentes
- **WHEN** o mesmo participante, no mesmo estado, envia o mesmo texto por canais
  diferentes
- **THEN** o núcleo toma a mesma decisão e produz a mesma resposta

#### Scenario: Núcleo não conhece o transporte
- **WHEN** o núcleo é chamado em teste, sem nenhum canal ativo
- **THEN** ele processa a mensagem normalmente, usando a função de envio recebida

### Requirement: Adaptador é fino e não decide

Cada canal SHALL ter um adaptador responsável apenas por: identificar o participante,
obter o texto da mensagem, fornecer a função de envio e informar o canal.

Um adaptador SHALL NOT decidir entre anamnese e conversa livre, SHALL NOT classificar
a mensagem, SHALL NOT montar prompt e SHALL NOT chamar o LLM diretamente.

Comportamento específico de um transporte — transcrição de áudio, filtro de origem da
mensagem, rede de segurança para remetente desconhecido — SHALL permanecer no
adaptador daquele canal e SHALL NOT subir para o núcleo.

#### Scenario: Áudio é do adaptador
- **WHEN** chega áudio pelo WhatsApp
- **THEN** o adaptador transcreve e entrega texto ao núcleo, que não sabe que houve
  áudio

#### Scenario: Remetente desconhecido não alcança o núcleo
- **WHEN** chega mensagem de um número que não corresponde a nenhum participante
- **THEN** o adaptador do WhatsApp resolve o caso, e o núcleo não é chamado

### Requirement: Toda interação registra o canal de origem

O núcleo SHALL registrar, em cada linha de histórico que criar, por qual canal a
mensagem chegou.

Disparo de gatilho SHALL ser registrado com o canal por onde foi enviado.

#### Scenario: Conversa em dois canais permanece legível
- **WHEN** um participante responde parte da anamnese por um canal e parte por outro
- **THEN** o histórico mostra, em cada linha, por onde aquela mensagem chegou

### Requirement: O comportamento do WhatsApp não muda

A extração do núcleo SHALL preservar, para o participante do WhatsApp, o mesmo
comportamento observável de antes: mesmas mensagens, mesma ordem, mesmos registros e
mesmos contadores.

#### Scenario: Anamnese pelo WhatsApp segue idêntica
- **WHEN** um participante responde a anamnese pelo WhatsApp depois da extração
- **THEN** recebe exatamente as mesmas mensagens que receberia antes
