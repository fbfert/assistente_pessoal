## MODIFIED Requirements

### Requirement: Consentimento formal registrado

O estado 0 SHALL apresentar um texto de consentimento que declare explicitamente
que se trata de um piloto de teste, que dado de saúde sensível será armazenado, e
que o consentimento é revogável.

O texto SHALL ser lido do conteúdo versionado, semeado a partir da constante do
código.

O sistema SHALL registrar, ao receber resposta afirmativa: o aceite, a versão
**vigente** do texto de consentimento e o timestamp do aceite.

Editar o texto de consentimento SHALL sempre incrementar a versão vigente. O
sistema SHALL NOT oferecer caminho de salvar esse texto mantendo a versão.

O sistema SHALL NOT avançar para o estado 1 sem resposta afirmativa registrada.

Motivo registrado: `consentimento_versao` só significa alguma coisa se identificar
qual texto a pessoa leu. Permitir editar o texto sem trocar a versão faria o campo
apontar para um conteúdo que não existe mais, e o registro de consentimento
deixaria de comprovar o que promete comprovar.

#### Scenario: Aceite registrado
- **WHEN** o usuário no estado 0 responde "sim"
- **THEN** `consentimento_aceito`, `consentimento_versao` e
  `consentimento_timestamp` são gravados e o estado passa a 1 (NOME)

#### Scenario: Recusa não avança
- **WHEN** o usuário no estado 0 responde "não"
- **THEN** o estado permanece 0 e nenhum dado de anamnese é coletado

#### Scenario: Edição do texto troca a versão
- **WHEN** o operador salva uma alteração no texto de consentimento
- **THEN** a versão vigente é incrementada

#### Scenario: Participante novo recebe a versão vigente
- **WHEN** alguém aceita o consentimento depois de uma edição
- **THEN** a versão gravada é a nova

### Requirement: Máquina de estados de 13 posições

A anamnese SHALL progredir por estados numerados de 0 a 12, avançando no máximo um
estado por mensagem recebida: 0 CONSENTIMENTO, 1 NOME, 2 O_QUE_TRAVA, 3 ROTINA,
4 GATILHOS_DE_SOBRECARGA, 5 SINAL_DE_ALERTA, 6 REMEDIO, 7 PESSOAS_CHAVE,
8 VOCABULARIO_PROPRIO, 9 NUNCA_FAZER, 10 PERSONALIDADE, 11 RESUMO, 12 CONCLUIDO.

Os estados SHALL ser expostos como um enum congelado (`Object.freeze`), e nenhum
módulo pode comparar contra o número literal em vez do enum.

A transição SHALL ser calculada por funções puras que não importam a camada de
banco: recebem o usuário atual, o texto da resposta e as dependências injetadas, e
devolvem um plano de ação que o chamador aplica. Isso existe para permitir teste
sem SQLite real.

O texto das perguntas SHALL ser lido do conteúdo versionado, semeado a partir das
constantes do código, sem alterar a pureza das funções de transição.

#### Scenario: Avanço normal de estado
- **WHEN** o usuário no estado 2 (O_QUE_TRAVA) responde com um texto concreto
- **THEN** a resposta é gravada no campo `o_que_trava` e o estado passa a 3 (ROTINA)

#### Scenario: Uma pergunta por mensagem
- **WHEN** a máquina de estados processa qualquer resposta
- **THEN** o plano de ação devolvido contém no máximo uma pergunta ao usuário

#### Scenario: Pergunta editada alcança a conversa
- **WHEN** o operador altera o texto de uma pergunta da anamnese
- **THEN** o próximo participante a chegar naquele estado recebe o texto novo

## ADDED Requirements

### Requirement: Versão do consentimento visível no participante

A página de detalhe do participante SHALL exibir a versão de consentimento que ele
aceitou e indicar se essa versão é a vigente ou uma anterior.

#### Scenario: Versão desatualizada é sinalizada
- **WHEN** o participante aceitou uma versão anterior à vigente
- **THEN** a página indica isso de forma visível, sem exigir abrir o histórico
