## ADDED Requirements

### Requirement: Núcleo e variantes vêm do conteúdo versionado

O núcleo fixo e as três variantes de tom SHALL ser lidos do conteúdo versionado,
semeado a partir das constantes do código.

A montagem do system prompt SHALL continuar exigindo o núcleo em qualquer
personalidade, e SHALL continuar concatenando apenas a variante escolhida.

Falha ao ler o conteúdo versionado SHALL recair na constante do código, e SHALL
NOT produzir system prompt sem núcleo.

Motivo registrado: um system prompt sem núcleo é um assistente sem a Regra 1b e
sem a proibição de agir como terapeuta. Preferir a constante a seguir sem núcleo
é o único fallback aceitável.

#### Scenario: Conteúdo editado alcança a conversa
- **WHEN** o núcleo fixo é alterado pela interface
- **THEN** a próxima montagem de system prompt usa o texto novo

#### Scenario: Falha de leitura não remove o núcleo
- **WHEN** a leitura do conteúdo versionado falha
- **THEN** o system prompt é montado com a constante do código, nunca sem núcleo
