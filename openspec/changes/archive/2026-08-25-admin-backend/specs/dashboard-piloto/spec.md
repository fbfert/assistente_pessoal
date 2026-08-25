## MODIFIED Requirements

### Requirement: Renderização HTML simples

O dashboard SHALL renderizar tabelas HTML sem biblioteca de gráfico, destacando
visualmente a linha de quem está com alerta de sobrecarga.

O dashboard SHALL exigir sessão de operador autenticada em toda página que exiba dado
de participante.

Motivo registrado: são 5 pessoas. Biblioteca de gráfico é complexidade sem retorno
nessa escala. A exigência de autenticação passa a existir porque a superfície deixou de
ser somente leitura e passou a exibir o histórico completo de conversas.

#### Scenario: Linha em alerta se destaca
- **WHEN** a página é renderizada com um usuário em alerta
- **THEN** a linha desse usuário é destacada em relação às demais

#### Scenario: Página de dado sem sessão
- **WHEN** alguém sem sessão acessa uma página que exibe dado de participante
- **THEN** é redirecionado ao login e nenhum dado é exposto

## ADDED Requirements

### Requirement: Listas por status de esteira

O dashboard SHALL oferecer, além dos totalizadores, a lista nominal dos participantes
em cada estágio da esteira: pendentes de consentimento, consentidos com anamnese
incompleta, e concluídos.

Cada lista SHALL identificar seus integrantes, e SHALL NOT se limitar a informar a
contagem.

Motivo registrado: a contagem diz que existe um problema; a lista diz em quem cutucar.

#### Scenario: Pendentes de consentimento
- **WHEN** existem participantes convidados que ainda não aceitaram o consentimento
- **THEN** a lista de pendentes identifica cada um deles

#### Scenario: Consentidos em andamento
- **WHEN** existe participante que consentiu mas está com anamnese incompleta
- **THEN** ele aparece na lista de em andamento, com o estado em que parou

### Requirement: Página de detalhe do participante

O dashboard SHALL oferecer uma página por participante contendo: todos os campos da
anamnese, a personalidade escolhida, o estado do consentimento com timestamp e versão,
os remédios cadastrados, os gatilhos configurados com horário e situação, e o histórico
completo de interações em ordem cronológica.

A página SHALL reaproveitar as funções de acesso a dados já existentes, e SHALL NOT
duplicar consulta que já exista.

#### Scenario: Histórico completo visível
- **WHEN** a página de detalhe de um participante com conversas é aberta
- **THEN** as interações aparecem em ordem cronológica, com tipo, timestamp e texto

#### Scenario: Campo não preenchido
- **WHEN** um campo de anamnese nunca foi respondido
- **THEN** a página indica a ausência de informação, sem inventar conteúdo

### Requirement: Página de estado da conexão

O dashboard SHALL oferecer uma página com o estado da conexão do WhatsApp e o QR de
pareamento pendente, conforme a capacidade `estado-conexao`.

#### Scenario: Acesso ao pareamento sem terminal
- **WHEN** o bot está aguardando pareamento
- **THEN** o operador consegue escanear o QR pela interface, sem abrir sessão de terminal
