## MODIFIED Requirements

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
