## ADDED Requirements

### Requirement: Trocar a personalidade do participante

O admin SHALL permitir trocar a personalidade de um participante entre os três
valores aceitos.

A ação SHALL oferecer apenas os valores válidos como opções fechadas, e SHALL NOT
aceitar texto livre.

A ação SHALL usar a função de gravação já existente, e SHALL NOT ser encaixada no
formulário genérico de campos de anamnese.

Motivo registrado: a personalidade tem CHECK próprio no schema e não pertence à
whitelist de campos de anamnese. Tratá-la como campo de texto livre permitiria
tentar gravar valor inválido e receber erro de banco em vez de recusa na
interface. Trocar importa porque o estado 10 da anamnese assume `neutro` quando
a resposta não é reconhecida — existe um caminho conhecido em que a pessoa fica
com um tom que não escolheu.

#### Scenario: Troca aplicada
- **WHEN** o operador escolhe outra personalidade para um participante
- **THEN** o valor gravado é o escolhido, e as mensagens seguintes usam o novo tom

#### Scenario: Valor inválido é recusado
- **WHEN** chega uma requisição com personalidade fora dos três valores
- **THEN** a gravação é recusada e o valor anterior permanece

#### Scenario: A troca é auditada
- **WHEN** a personalidade é trocada
- **THEN** uma linha de auditoria registra o valor anterior, o novo e quem trocou
