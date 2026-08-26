# anamnese Specification

## Purpose

Conduzir o onboarding do usuário como uma conversa de WhatsApp, uma pergunta por vez, do
consentimento formal até a ativação dos gatilhos, capturando o vocabulário e os limites que a
persona vai respeitar depois. É a única etapa que coleta dado de saúde diretamente do usuário.

## Requirements

### Requirement: Máquina de estados de 13 posições

A anamnese SHALL progredir por estados numerados de 0 a 12, avançando no máximo um estado por
mensagem recebida: 0 CONSENTIMENTO, 1 NOME, 2 O_QUE_TRAVA, 3 ROTINA, 4 GATILHOS_DE_SOBRECARGA,
5 SINAL_DE_ALERTA, 6 REMEDIO, 7 PESSOAS_CHAVE, 8 VOCABULARIO_PROPRIO, 9 NUNCA_FAZER,
10 PERSONALIDADE, 11 RESUMO, 12 CONCLUIDO.

Os estados SHALL ser expostos como um enum congelado (`Object.freeze`), e nenhum módulo pode
comparar contra o número literal em vez do enum.

A transição SHALL ser calculada por funções puras que não importam a camada de banco: recebem
o usuário atual, o texto da resposta e as dependências injetadas, e devolvem um plano de ação
que o chamador aplica. Isso existe para permitir teste sem SQLite real.

A máquina de estados SHALL ser independente de canal: o estado é do participante, não do
transporte, e uma anamnese iniciada por um canal SHALL poder continuar por outro, do ponto
em que parou.

O texto das perguntas, do consentimento, do pedido de exemplo e da conclusão SHALL ter
origem única, compartilhada por todos os canais. Nenhum canal SHALL manter cópia própria
desses textos.

Motivo registrado: duplicar o conteúdo por canal faria a correção de uma pergunta valer só
para quem estivesse do lado corrigido — e o participante não tem como saber que existem duas
versões.

#### Scenario: Avanço normal de estado
- **WHEN** o usuário no estado 2 (O_QUE_TRAVA) responde com um texto concreto
- **THEN** a resposta é gravada no campo `o_que_trava` e o estado passa a 3 (ROTINA)

#### Scenario: Uma pergunta por mensagem
- **WHEN** a máquina de estados processa qualquer resposta
- **THEN** o plano de ação devolvido contém no máximo uma pergunta ao usuário

#### Scenario: Anamnese continua no outro canal
- **WHEN** um participante responde até o estado 4 por um canal e escreve pelo outro
- **THEN** recebe a pergunta do estado 5, sem repetir nenhuma anterior

### Requirement: Consentimento formal registrado

O estado 0 SHALL apresentar um texto de consentimento que declare explicitamente que se trata
de um piloto de teste, que dado de saúde sensível será armazenado, e que o consentimento é
revogável.

O sistema SHALL registrar, ao receber resposta afirmativa: o aceite, a versão do texto de
consentimento (`v1`) e o timestamp do aceite.

O sistema SHALL NOT avançar para o estado 1 sem resposta afirmativa registrada.

#### Scenario: Aceite registrado
- **WHEN** o usuário no estado 0 responde "sim"
- **THEN** `consentimento_aceito`, `consentimento_versao` e `consentimento_timestamp` são
  gravados e o estado passa a 1 (NOME)

#### Scenario: Recusa não avança
- **WHEN** o usuário no estado 0 responde "não"
- **THEN** o estado permanece 0 e nenhum dado de anamnese é coletado

### Requirement: Reconhecimento de resposta por igualdade exata

As funções `isAfirmativo`, `isNegativo` e `isPular` SHALL normalizar o texto (trim, lowercase,
remoção de pontuação final) e compará-lo por **igualdade exata** contra um conjunto fechado de
frases canônicas.

O sistema SHALL NOT reconhecer essas respostas por casamento de prefixo nem por expressão
regular aberta.

Motivo registrado: uma implementação por prefixo (`/^(sim|s|ok|pode)\b/`) fez a resposta livre
"pode me chamar de Ana", destinada à pergunta de NOME, ser lida como afirmativo de
CONSENTIMENTO, descolando toda a conversa — cada pergunta seguinte passou a gravar no campo
errado.

#### Scenario: Frase livre não é confundida com afirmativo
- **WHEN** `isAfirmativo` recebe o texto "pode me chamar de Ana"
- **THEN** retorna falso

#### Scenario: Frase canônica é reconhecida
- **WHEN** `isAfirmativo` recebe "Sim." ou "ok" ou "blz"
- **THEN** retorna verdadeiro

### Requirement: Tolerância a resposta vaga

Ao receber uma resposta vaga (por exemplo "sei lá", "normal"), o sistema SHALL pedir um exemplo
concreto **uma única vez** por estado.

Se a segunda resposta continuar vaga, o sistema SHALL aceitá-la como está e avançar de estado.

Quando a resposta for uma **pergunta de volta** — reconhecida por igualdade exata contra
um conjunto fechado de frases de dúvida, nunca por regex de prefixo — o sistema SHALL
reformular a pergunta e manter o estado, e SHALL NOT gravar a dúvida como resposta.

A reformulação SHALL usar a mesma segunda chance por estado da resposta vaga: uma dúvida
seguida de outra SHALL ser aceita como está, para não travar quem não vai responder.

Cada pergunta SHALL ter um texto de reformulação próprio.

Motivo registrado: na primeira sessão real do piloto, "Como assim?" foi gravado como o
valor de pessoas-chave e passou a entrar no system prompt daquela pessoa como se fosse
fato sobre ela. O conjunto é fechado, e não heurística, pela mesma razão do
reconhecimento de consentimento: prefixo solto já descolou esta máquina de estados uma
vez.

Motivo registrado: zero-disciplina é premissa do produto. Travar o usuário tentando arrancar
qualidade da resposta perde o usuário.

#### Scenario: Primeiro pedido de exemplo
- **WHEN** o usuário responde "sei lá" e ainda não foi pedido exemplo neste estado
- **THEN** o sistema pede um exemplo concreto e mantém o estado

#### Scenario: Segunda resposta vaga é aceita
- **WHEN** o usuário responde vagamente pela segunda vez no mesmo estado
- **THEN** a resposta é gravada como está e o estado avança

#### Scenario: Pergunta de volta é reformulada
- **WHEN** o usuário responde "como assim?" a uma pergunta da anamnese
- **THEN** o sistema explica a pergunta de outro jeito, o estado não muda e nada é gravado
  naquele campo

#### Scenario: Dúvida repetida não trava a pessoa
- **WHEN** o usuário responde com dúvida pela segunda vez no mesmo estado
- **THEN** a resposta é gravada como está e o estado avança

### Requirement: Extração de remédio sem invenção

O estado 6 SHALL delegar a extração de nome e horário de remédio a uma função injetada como
dependência, para permitir mock em teste.

A extração SHALL instruir o LLM a nunca inventar nem estimar nome, dose ou horário, e SHALL
pedir resposta em JSON estrito.

Quando o parse da resposta falhar, a extração SHALL retornar lista vazia em vez de lançar erro.

Quando um campo não tiver sido informado, o valor gravado SHALL ser a string literal
`sem informação`, com acento e cedilha.

O estado 6 SHALL ser pulável: uma resposta canônica de negação ("não tenho", "não uso") avança
sem cadastrar remédio.

#### Scenario: LLM não informa horário
- **WHEN** o LLM devolve um remédio com nome preenchido e horário ausente
- **THEN** o horário gravado é `sem informação` e nenhum horário é estimado

#### Scenario: Resposta do LLM ilegível
- **WHEN** a resposta do LLM não é JSON válido
- **THEN** a extração retorna lista vazia e o fluxo da anamnese continua

#### Scenario: Usuário não usa remédio
- **WHEN** o usuário no estado 6 responde "não tenho"
- **THEN** nenhum remédio é cadastrado e o estado avança para 7

### Requirement: Escolha de personalidade com fallback

O estado 10 SHALL apresentar as três personalidades e mapear a resposta do usuário para um dos
valores canônicos `direto`, `caloroso` ou `neutro`, aceitando tanto o número da opção quanto o
nome.

Quando a resposta não for reconhecida, o sistema SHALL perguntar novamente **uma vez**.

Quando a segunda resposta também não for reconhecida, o sistema SHALL assumir `neutro` e
avançar, em vez de travar o onboarding.

#### Scenario: Segunda resposta não reconhecida
- **WHEN** o usuário responde algo não reconhecido pela segunda vez no estado 10
- **THEN** a personalidade gravada é `neutro` e o estado avança para 11

### Requirement: Resumo com correção apenas registrada

O estado 11 SHALL apresentar ao usuário um resumo do que foi entendido e perguntar se está
correto.

Quando o usuário indicar que há erro, o sistema SHALL registrar uma interação do tipo
`correcao_reportada` no histórico e avançar mesmo assim.

O sistema SHALL NOT tentar parsear automaticamente qual campo deve ser corrigido.

O texto apresentado ao usuário SHALL deixar explícito que o que ele apontar fica
anotado para a equipe ajustar, e SHALL NOT dar a entender que a correção foi aplicada.

Motivo registrado: na escala de 5 pessoas, correção manual no banco é aceitável e mais
confiável que parse automático. Mas ficar calado sobre isso fez a primeira participante
real apontar um erro e seguir achando que tinha corrigido — o silêncio custou mais que o
parse teria custado.

#### Scenario: Usuário aponta erro no resumo
- **WHEN** o usuário no estado 11 responde que há algo errado
- **THEN** uma interação `correcao_reportada` com o texto do usuário é registrada e o estado
  avança para 12

#### Scenario: O resumo não promete conserto
- **WHEN** o resumo é apresentado ao usuário
- **THEN** o texto diz que correções ficam anotadas para a equipe, sem afirmar que serão
  aplicadas automaticamente

### Requirement: Conclusão ativa os gatilhos padrão

Ao entrar no estado 12, o sistema SHALL ativar os gatilhos padrão do usuário conforme a
capacidade `gatilhos`.

#### Scenario: Anamnese concluída
- **WHEN** o usuário chega ao estado 12
- **THEN** os gatilhos padrão são configurados e o usuário passa a receber disparos
