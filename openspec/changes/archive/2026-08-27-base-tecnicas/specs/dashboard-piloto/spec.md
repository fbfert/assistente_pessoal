## MODIFIED Requirements

### Requirement: Telas de operação na navegação

O admin SHALL oferecer, na navegação, acesso à tela de gatilhos, à tela de
persona e à tela de técnicas.

Todas SHALL exigir sessão autenticada, como as demais páginas que expõem
configuração do piloto.

#### Scenario: Acesso pela navegação
- **WHEN** um administrador autenticado abre qualquer página do admin
- **THEN** encontra na navegação o caminho para gatilhos, para persona e para técnicas

#### Scenario: Sem sessão não há acesso
- **WHEN** alguém sem sessão acessa qualquer uma dessas telas
- **THEN** é redirecionado ao login
