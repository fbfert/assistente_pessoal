## ADDED Requirements

### Requirement: A técnica do contexto é oferta, não roteiro

Quando houver técnica no contexto, o núcleo fixo SHALL instruir o modelo a
tratá-la como **uma opção disponível**, a usar apenas se couber naturalmente na
conversa, e a apresentá-la com as palavras da conversa em vez de recitar o
texto da base.

O núcleo fixo SHALL instruir o modelo a IGNORAR a técnica quando ela não couber,
e SHALL NOT instruir o modelo a sempre entregá-la.

O núcleo fixo SHALL manter valendo, com técnica no contexto ou sem ela, a regra
de uma sugestão por vez e a regra que proíbe qualquer instrução sobre medicação.

A técnica SHALL NOT sobrepor a regra que manda reduzir a exigência em momento de
sobrecarga: percebida a sobrecarga, o modelo SHALL deixar a técnica de lado.

Motivo registrado: a base existe para dar matéria-prima concreta ao modelo, não
para transformá-lo em distribuidor de fichas de método. Instrução de sempre usar
produziria resposta pior que a de hoje — encaixada à força.

#### Scenario: A técnica cabe
- **WHEN** o participante descreve dificuldade de começar e há técnica no contexto
- **THEN** o modelo pode oferecê-la, com as palavras da conversa

#### Scenario: A técnica não cabe
- **WHEN** a técnica no contexto não tem relação com o que a pessoa acabou de dizer
- **THEN** o modelo responde sem ela

#### Scenario: Sobrecarga vence a técnica
- **WHEN** o participante demonstra sobrecarga e há técnica no contexto
- **THEN** a resposta reduz a exigência e não oferece a técnica

#### Scenario: A técnica não abre exceção para medicação
- **WHEN** há técnica no contexto
- **THEN** a proibição de instruir sobre medicação continua valendo integralmente
