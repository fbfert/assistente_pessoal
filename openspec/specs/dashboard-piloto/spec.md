# dashboard-piloto Specification

## Purpose

Dar ao operador do piloto uma visão de quem está engajando e quem está sumindo, com destaque
para quem cruzou o limiar de silêncio. Ferramenta interna de 5 linhas, não produto.

## Requirements

### Requirement: Agregações de acompanhamento

O dashboard SHALL agregar, por usuário: despejos espontâneos da semana, silêncios por tipo de
gatilho, correções reportadas e o funil de check-in.

O dashboard SHALL marcar um usuário com alerta de sobrecarga quando qualquer contador de
silêncios consecutivos dele atingir o limite configurado.

#### Scenario: Alerta de sobrecarga
- **WHEN** um usuário tem silêncio consecutivo igual ao limite configurado em qualquer tipo de
  gatilho
- **THEN** ele aparece marcado com alerta de sobrecarga

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

### Requirement: Exposição apenas em loopback

O dashboard SHALL ser alcançável apenas pelo loopback do host, e SHALL NOT ser exposto em
interface pública.

Onde a restrição é aplicada depende de como o processo roda:

- Executado diretamente no host, o processo SHALL escutar em `127.0.0.1`.
- Executado em container, o processo SHALL escutar em `0.0.0.0` e a restrição SHALL ser feita
  pelo bind `127.0.0.1:<porta>` da publicação de porta.

A interface de escuta SHALL ser configurável por variável de ambiente (`DASHBOARD_HOST`), com
padrão `127.0.0.1`.

O acesso remoto SHALL ser feito por túnel SSH.

Motivo registrado: o dashboard mostra dado de saúde de 5 pessoas identificadas e não tem
autenticação. É decisão de segurança, não detalhe de configuração.

Dentro de um container, `127.0.0.1` é o loopback **do container** — o mapeamento de porta do
Docker não o alcança, e o dashboard fica inacessível. Escutar em `0.0.0.0` ali não afrouxa a
garantia: ela apenas muda de lugar, do processo para a publicação de porta. A verificação
correta é a porta observada no host, não a interface que o processo pediu.

#### Scenario: Porta não escuta em interface pública
- **WHEN** a composição de containers sobe
- **THEN** a porta do dashboard está publicada apenas em `127.0.0.1`

#### Scenario: Verificação no host
- **WHEN** as portas em escuta do host são inspecionadas
- **THEN** a porta do dashboard aparece ligada a `127.0.0.1` e não a `0.0.0.0`

#### Scenario: Execução direta no host
- **WHEN** o processo roda fora de container, sem `DASHBOARD_HOST` definido
- **THEN** ele escuta em `127.0.0.1`

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
