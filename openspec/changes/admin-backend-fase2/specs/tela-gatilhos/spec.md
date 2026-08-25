## Purpose

Reunir numa página só o que hoje está espalhado em três lugares: os padrões
globais de cada tipo de gatilho, a mensagem de cada um, e o estado de todos os
participantes — para que ajustar o piloto não exija abrir cinco telas e lembrar
onde cada coisa mora.

## ADDED Requirements

### Requirement: Visão por tipo de gatilho

A tela SHALL apresentar os três tipos de gatilho e, para cada um: o horário padrão
global, a mensagem atual e quantos participantes têm aquele tipo ativo.

O horário padrão e a mensagem SHALL ser editáveis na própria tela.

A contagem SHALL refletir o estado real dos gatilhos configurados.

#### Scenario: Contagem bate com o banco
- **WHEN** três participantes têm o check-in matinal ativo e um está com ele inativo
- **THEN** a tela informa três

#### Scenario: Edição sem navegar para outra tela
- **WHEN** o operador altera o horário padrão do check-in matinal
- **THEN** a alteração é aceita ali mesmo, sem redirecionar para outra página

### Requirement: Pré-visualização antes de salvar a mensagem

A tela SHALL permitir ver o texto final da mensagem antes de a alteração ser
confirmada.

#### Scenario: Ver antes de publicar
- **WHEN** o operador edita a mensagem de um gatilho
- **THEN** consegue ver como ela ficará antes de confirmar

### Requirement: O padrão global não retroage

A tela SHALL declarar explicitamente que alterar horário ou mensagem padrão afeta
apenas participantes configurados a partir daquele momento.

Alterar o padrão global SHALL NOT modificar gatilho já configurado de participante
existente.

Motivo registrado: os gatilhos são materializados por participante quando a
anamnese conclui. Sem o aviso, o operador altera o padrão, não vê efeito em quem
já está no piloto e conclui que a tela não funciona.

#### Scenario: Participante existente não é afetado
- **WHEN** o horário padrão do check-in muda de 08:00 para 09:00
- **THEN** quem já concluiu a anamnese continua com o horário que tinha

#### Scenario: Participante novo recebe o padrão novo
- **WHEN** um participante conclui a anamnese depois da mudança
- **THEN** o gatilho dele nasce com o horário novo

### Requirement: Estado por participante em leitura, com link para editar

A tela SHALL listar os participantes com a situação de cada um dos três gatilhos.

Essa listagem SHALL ser somente leitura, e SHALL oferecer link para a página de
detalhe do participante.

A tela SHALL NOT duplicar o formulário de edição por participante que já existe
naquela página.

#### Scenario: Caminho para editar um participante específico
- **WHEN** o operador quer mudar o gatilho de uma pessoa só
- **THEN** encontra na listagem um link para a página de detalhe dela
