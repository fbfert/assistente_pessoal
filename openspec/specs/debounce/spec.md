# debounce Specification

## Purpose

Responder uma vez a quem manda três mensagens seguidas, em vez de três vezes.
Quem está em sobrecarga escreve em rajada; devolver uma resposta por fragmento
multiplica o ruído justamente quando ele já é o problema.

## Requirements

### Requirement: Agrupamento por janela configurável

O sistema SHALL esperar um intervalo configurável após a última mensagem antes de
processar, agrupando o que chegou nesse intervalo.

Cada mensagem nova SHALL reiniciar a contagem da janela.

Quando a janela fechar, as mensagens acumuladas SHALL ser concatenadas na ordem de
chegada e processadas como uma única mensagem, pela mesma classificação e pela
mesma chamada de LLM já existentes.

#### Scenario: Rajada vira uma resposta
- **WHEN** três mensagens chegam dentro da janela
- **THEN** o participante recebe uma única resposta, considerando as três

#### Scenario: Mensagens espaçadas são independentes
- **WHEN** duas mensagens chegam separadas por mais que a janela
- **THEN** cada uma gera sua própria resposta

### Requirement: Desligado por padrão

O intervalo SHALL ter zero como valor padrão, e zero SHALL significar processar
imediatamente, como antes.

#### Scenario: Comportamento anterior preservado
- **WHEN** o intervalo está em zero
- **THEN** cada mensagem é processada assim que chega

### Requirement: Agrupamento é do canal WhatsApp

O agrupamento SHALL viver no adaptador do WhatsApp e SHALL NOT ser aplicado ao canal
web.

O núcleo de conversa SHALL NOT conhecer o agrupamento: ele continua recebendo uma
mensagem e devolvendo uma resposta.

Motivo registrado: agrupar é comportamento de transporte, da mesma família da
transcrição de áudio e do filtro de mensagem de grupo. No canal web a rota é
requisição-resposta — segurar a requisição por segundos deixaria a pessoa diante de
uma tela travada, e devolver vazio não teria para onde mandar a resposta depois,
porque a web não tem entrega proativa. Além disso a rajada não acontece lá: o cliente
desabilita o envio enquanto a chamada está pendente.

#### Scenario: Mensagem pela web não é agrupada
- **WHEN** chega mensagem pelo canal web com o intervalo configurado acima de zero
- **THEN** ela é processada imediatamente e a resposta volta na mesma requisição

### Requirement: Nunca durante a anamnese

O agrupamento SHALL ser aplicado apenas a participante com anamnese concluída.

Mensagem de participante em anamnese SHALL ser processada imediatamente,
independentemente do intervalo configurado.

Motivo registrado: a anamnese é pergunta-resposta de um passo por vez. Agrupar
duas mensagens ali faria a máquina de estados pular um estado ou gravar duas
respostas no mesmo campo.

#### Scenario: Anamnese ignora o agrupamento
- **WHEN** um participante em anamnese manda duas mensagens seguidas com o
  intervalo configurado acima de zero
- **THEN** cada uma é processada imediatamente, uma pergunta por vez

### Requirement: Áudio entra no grupo, na ordem

Mensagem de áudio recebida durante a janela SHALL ser transcrita e incorporada ao
grupo na posição em que chegou.

Áudio SHALL NOT ser processado à frente do texto que chegou antes dele.

Motivo registrado: deixar o áudio passar direto faria a resposta chegar fora de
ordem em relação ao texto anterior, sem que a pessoa tenha como entender por quê.

#### Scenario: Texto e áudio na mesma janela
- **WHEN** chega um texto e depois um áudio dentro da janela
- **THEN** a resposta considera os dois na ordem de chegada
