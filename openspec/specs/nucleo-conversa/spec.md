# nucleo-conversa Specification

## Purpose

Garantir que exista **um** caminho de processamento de mensagem, exercitado por
qualquer canal, para que WhatsApp e web não virem dois produtos com a mesma marca.

## Requirements

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

### Requirement: Toda mensagem enviada é registrada

O núcleo SHALL registrar, no histórico do participante, cada mensagem que enviar —
pergunta de anamnese e resposta de conversa livre —, com o canal por onde saiu.

O registro SHALL acontecer depois do envio bem-sucedido.

Falha no envio SHALL NOT produzir registro de mensagem enviada.

Motivo registrado: registrar antes do envio produziria histórico de mensagem que nunca
chegou. Quando o envio falha, a ausência da linha é a informação correta.

#### Scenario: Os dois lados no histórico
- **WHEN** um participante conversa com o assistente
- **THEN** o histórico contém a mensagem dele e a resposta do sistema, em ordem

#### Scenario: Anamnese também registra o que perguntou
- **WHEN** o sistema faz uma pergunta da anamnese
- **THEN** a pergunta enviada fica registrada

### Requirement: Remédio dito na conversa livre é gravado, com horário e confirmação

Quando o texto de um participante com anamnese concluída tiver indício de medicação, o
sistema SHALL executar a extração de remédio já existente, com o mesmo prompt estrito.

O sistema SHALL gravar apenas item que vier com **horário**; item sem horário SHALL ser
descartado sem alterar nada.

Remédio cujo nome já exista para aquele participante SHALL ter o horário atualizado;
nome novo SHALL criar um remédio. Em ambos os casos o gatilho de remédio correspondente
SHALL ser reconciliado.

O sistema SHALL confirmar ao participante, na resposta, exatamente o que foi gravado.

A confirmação registrada como mensagem enviada SHALL servir de rastro de auditoria da
gravação: ela diz, na linha do tempo da pessoa, exatamente o que o sistema gravou e
quando. O sistema SHALL NOT criar um tipo de interação separado para isso.

A extração SHALL NOT rodar durante a anamnese, onde o estado 6 já faz esse trabalho, e
falha dela SHALL NOT impedir a resposta normal.

Motivo registrado: a pessoa pediu "considere 23 horas pro bup" e nada foi gravado — sem
horário não há gatilho, então o lembrete que ela pediu nunca tocaria, e ela não tinha
como saber. Exigir horário é o que evita que uma menção de passagem vire cadastro; a
confirmação em voz alta é o que dá a ela a chance de dizer "não é meu".

#### Scenario: Horário explícito é gravado e confirmado
- **WHEN** o participante diz o horário de um remédio na conversa livre
- **THEN** o horário é gravado, o gatilho é reconciliado e a resposta diz o que foi gravado

#### Scenario: Menção sem horário não grava nada
- **WHEN** o participante cita um remédio sem dizer horário
- **THEN** nada é gravado e nenhum remédio novo é criado

#### Scenario: Remédio que já existe é atualizado, não duplicado
- **WHEN** o participante informa o horário de um remédio que já está cadastrado
- **THEN** o horário daquele remédio é atualizado, sem criar um segundo

#### Scenario: Falha na extração não afeta a conversa
- **WHEN** a extração falha
- **THEN** a resposta normal é enviada e nada é gravado

### Requirement: Nenhuma resposta com instrução de medicação é enviada

Antes de enviar resposta de conversa livre, o núcleo SHALL verificar o texto contra os
nomes de remédio **já cadastrados daquele participante** combinados com verbos de
instrução.

Batendo os dois juntos, a resposta SHALL NOT ser enviada. No lugar, o sistema SHALL
enviar uma mensagem fixa dizendo que essa decisão não é dele e oferecendo outro assunto.

O texto recusado SHALL ser registrado como `resposta_bloqueada_seguranca`.

A verificação SHALL ser determinística e SHALL NOT usar modelo de linguagem para julgar
se a resposta é segura.

A verificação SHALL viver no núcleo e valer igualmente para todos os canais, e
SHALL NOT ser duplicada em nenhum adaptador.

Mensagem de anamnese SHALL NOT passar pela verificação, por ser texto constante do
código e não saída de modelo.

Motivo registrado: modelo de linguagem não obedece regra todas as vezes — muda de
versão, muda de provedor, e uma instrução compete com o resto do contexto. Apostar a
segurança de dado de saúde regulado só no prompt seria construir a proteção no ponto
mais frágil disponível. Usar modelo para vigiar modelo herdaria a mesma falha.

Exigir nome cadastrado **e** verbo é o que separa "comece pelo Vortex agora" de "o
Vortex está no teu cadastro sem horário".

#### Scenario: Instrução de tomar remédio é bloqueada
- **WHEN** o modelo devolve uma resposta mandando a pessoa tomar um remédio que ela tem
  cadastrado
- **THEN** a pessoa recebe a mensagem fixa, e o texto recusado fica registrado

#### Scenario: Resposta sem instrução passa normalmente
- **WHEN** o modelo devolve uma resposta que não instrui sobre medicação
- **THEN** ela é enviada como está, sem registro de bloqueio

#### Scenario: O bloqueio vale nos dois canais
- **WHEN** a mesma resposta perigosa acontece pelo WhatsApp e pelo canal web
- **THEN** os dois são bloqueados do mesmo jeito

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
