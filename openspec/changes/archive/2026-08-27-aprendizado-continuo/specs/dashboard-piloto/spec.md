## MODIFIED Requirements

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

