## MODIFIED Requirements

### Requirement: Contexto da anamnese no system prompt

A montagem do system prompt SHALL incluir, como contexto, o que a anamnese capturou: nome, o
que trava, vocabulário próprio e o que nunca fazer.

A montagem SHALL incluir também as notas aprendidas ativas do participante, agrupadas
pelo campo a que pertencem.

As notas SHALL aparecer com rótulo distinto do da resposta original da anamnese, de modo
que o modelo consiga diferenciar o que a pessoa respondeu do que foi aprendido depois, e
SHALL trazer a data de cada uma.

Nota removida SHALL NOT aparecer no contexto.

A função que monta o contexto SHALL permanecer pura, recebendo as notas como parâmetro,
sem acessar a camada de banco.

Motivo registrado: sem rótulo diferente, um traço aprendido por inferência ficaria
indistinguível de uma resposta dada sob consentimento formal — e o modelo trataria os
dois com a mesma confiança. A pureza da função é o que permite testar a montagem do
prompt sem SQLite real, como já vale para a máquina de estados.

#### Scenario: Restrição do usuário chega ao prompt
- **WHEN** o usuário registrou algo em `nunca_fazer` durante a anamnese
- **THEN** esse texto aparece no system prompt montado

#### Scenario: Nota aprendida chega ao prompt, separada da anamnese
- **WHEN** o participante tem resposta de anamnese e nota aprendida no mesmo campo
- **THEN** as duas aparecem no system prompt, sob rótulos diferentes, e a nota traz sua
  data

#### Scenario: Nota removida não chega ao prompt
- **WHEN** a única nota de um campo foi removida pelo operador
- **THEN** o system prompt traz apenas a resposta original daquele campo

#### Scenario: Participante sem nota nenhuma
- **WHEN** o participante não tem nota aprendida
- **THEN** o contexto montado é o mesmo de antes desta mudança
