## ADDED Requirements

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

## MODIFIED Requirements

### Requirement: Página de detalhe do participante

O dashboard SHALL oferecer uma página por participante contendo: todos os campos da
anamnese, a personalidade escolhida, a data de nascimento, o estado do consentimento com
timestamp e versão, os remédios cadastrados, os gatilhos configurados com horário e
situação, e o histórico completo de interações em ordem cronológica.

A página SHALL reaproveitar as funções de acesso a dados já existentes, e SHALL NOT
duplicar consulta que já exista.

O histórico SHALL indicar, em cada interação, por qual canal ela chegou.

#### Scenario: Histórico completo visível
- **WHEN** a página de detalhe de um participante com conversas é aberta
- **THEN** as interações aparecem em ordem cronológica, com tipo, timestamp, canal e texto

#### Scenario: Campo não preenchido
- **WHEN** um campo de anamnese nunca foi respondido
- **THEN** a página indica a ausência de informação, sem inventar conteúdo

#### Scenario: Participante sem data de nascimento é visível como tal
- **WHEN** um participante cadastrado antes desta mudança é aberto
- **THEN** a página mostra a ausência da data, sem inventar valor
