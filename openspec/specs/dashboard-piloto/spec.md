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

As correções reportadas SHALL ser exibidas em destaque, com link direto para a página do
participante que a reportou.

Motivo registrado: correção reportada é a única coisa no painel que representa alguém
esperando uma ação humana. Listada sem destaque e sem link, ela é anotação que ninguém
abre.

#### Scenario: Alerta de sobrecarga
- **WHEN** um usuário tem silêncio consecutivo igual ao limite configurado em qualquer tipo de
  gatilho
- **THEN** ele aparece marcado com alerta de sobrecarga

#### Scenario: Correção reportada leva ao participante
- **WHEN** existe correção reportada
- **THEN** ela aparece em destaque no painel, com link para a página de quem reportou

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
anamnese, a personalidade escolhida, a data de nascimento, o estado do consentimento com
timestamp e versão, os remédios cadastrados, os gatilhos configurados com horário e
situação, as notas de perfil aprendidas depois da anamnese, e o histórico completo de
interações em ordem cronológica.

A página SHALL reaproveitar as funções de acesso a dados já existentes, e SHALL NOT
duplicar consulta que já exista.

O histórico SHALL indicar, em cada interação, por qual canal ela chegou.

As notas SHALL ser exibidas agrupadas por campo, com a data de cada uma, e cada nota ativa
SHALL oferecer ação de remoção, pela confirmação de duas etapas já padronizada. O texto de
cada nota SHALL ser escapado antes de ir para o HTML.

#### Scenario: Histórico completo visível
- **WHEN** a página de detalhe de um participante com conversas é aberta
- **THEN** as interações aparecem em ordem cronológica, com tipo, timestamp, canal e texto

#### Scenario: Campo não preenchido
- **WHEN** um campo de anamnese nunca foi respondido
- **THEN** a página indica a ausência de informação, sem inventar conteúdo

#### Scenario: Participante sem data de nascimento é visível como tal
- **WHEN** um participante cadastrado antes desta mudança é aberto
- **THEN** a página mostra a ausência da data, sem inventar valor

#### Scenario: Notas aprendidas visíveis por campo
- **WHEN** o participante tem notas aprendidas em mais de um campo
- **THEN** elas aparecem agrupadas por campo, cada uma com sua data e com ação de remover

#### Scenario: Participante sem notas
- **WHEN** o participante não tem nenhuma nota aprendida
- **THEN** a seção informa a ausência, sem sumir da página

#### Scenario: Remoção pede confirmação
- **WHEN** o operador aciona a remoção de uma nota
- **THEN** uma página intermediária descreve o efeito antes de qualquer alteração

### Requirement: Página de estado da conexão

O dashboard SHALL oferecer uma página com o estado da conexão do WhatsApp e o QR de
pareamento pendente, conforme a capacidade `estado-conexao`.

#### Scenario: Acesso ao pareamento sem terminal
- **WHEN** o bot está aguardando pareamento
- **THEN** o operador consegue escanear o QR pela interface, sem abrir sessão de terminal

### Requirement: Tela de credenciais de LLM

O admin SHALL oferecer uma tela para configurar chave e modelo de cada provedor,
acessível pela navegação e exigindo sessão autenticada.

A tela SHALL permitir escolher qual provedor está ativo para a conversa, num seletor
único, e SHALL indicar a escolha vigente.

Cada provedor SHALL oferecer, lado a lado, a ação de salvar e a ação de testar.

A seção do provedor OpenAI SHALL oferecer também o modelo de transcrição de áudio,
com a declaração de que ele usa a mesma chave daquela seção.

A tela SHALL NOT depender de JavaScript de cliente para nenhuma de suas funções.

Motivo registrado: nenhuma tela deste admin tem JavaScript de cliente — é a mesma
premissa que faz a confirmação de duas etapas ser uma página em GET no lugar de um
`confirm()`. Manter a premissa custa um recarregamento de página no teste e um campo
de texto sempre visível no lugar de um revelado por seleção.

#### Scenario: Acesso autenticado
- **WHEN** alguém sem sessão acessa a tela de credenciais
- **THEN** é redirecionado ao login, e nenhuma informação de credencial é exposta

#### Scenario: Estado de cada provedor visível
- **WHEN** a tela é aberta
- **THEN** cada provedor mostra se está configurado, os últimos caracteres da chave
  quando houver, e o modelo

#### Scenario: Resultado do teste na própria tela
- **WHEN** o operador aciona o teste de um provedor
- **THEN** o resultado aparece no bloco daquele provedor, sem exigir JavaScript

#### Scenario: Transcrição só na seção da OpenAI
- **WHEN** a tela é aberta
- **THEN** o campo de modelo de transcrição aparece apenas na seção da OpenAI

### Requirement: Corrigir a data de nascimento de participante existente

O admin SHALL permitir gravar ou corrigir a data de nascimento de um participante já
cadastrado, pela página de detalhe.

A alteração SHALL ser auditada como qualquer outra escrita sobre participante.

Motivo registrado: participantes cadastrados antes desta coluna não têm o dado, e sem
ele não conseguem entrar pelo canal web. Sem esse caminho, a única saída seria SQL
manual — que é exatamente o que o admin existe para eliminar.

#### Scenario: Participante antigo ganha a data
- **WHEN** o operador grava a data de nascimento de um participante que não tinha
- **THEN** o valor é gravado e a entrada pelo canal web passa a funcionar para ele
