## ADDED Requirements

### Requirement: Técnica prática entra no contexto da resposta

Para participante com anamnese concluída em conversa livre, o núcleo SHALL
identificar o tema do texto recebido e, havendo técnica publicada naquele tema,
SHALL incluí-la no contexto da chamada de resposta.

A busca SHALL acontecer **antes** da chamada de resposta, e SHALL NOT ser
colocada na execução paralela onde rodam a extração de remédio e o aprendizado
de perfil.

Motivo registrado: o resultado da busca entra no prompt da própria chamada de
resposta, então não há o que paralelizar. É consulta local a SQLite com índice —
ordem de microssegundos, não de rede.

A busca SHALL rodar apenas no núcleo, e SHALL NOT ser reimplementada em nenhum
adaptador. O comportamento SHALL ser idêntico no WhatsApp e na web.

Nenhuma técnica encontrada SHALL resultar no comportamento atual, sem erro e sem
diferença perceptível.

Falha da busca SHALL NOT impedir o envio da resposta: o núcleo SHALL seguir sem
técnica.

Passo de anamnese SHALL NOT receber técnica: ali a pergunta é fixa e o texto do
participante é resposta a pergunta fechada.

#### Scenario: Técnica publicada entra no prompt
- **WHEN** o participante escreve algo que casa um tema com técnica publicada
- **THEN** o system prompt daquela chamada contém a técnica

#### Scenario: Base vazia não muda nada
- **WHEN** nenhuma técnica está publicada
- **THEN** a resposta é gerada exatamente como antes desta mudança

#### Scenario: Falha da busca não derruba a conversa
- **WHEN** a busca lança erro
- **THEN** a resposta é gerada sem técnica e o participante não percebe diferença

#### Scenario: Anamnese não recebe técnica
- **WHEN** o participante está no meio da anamnese
- **THEN** nenhuma técnica é buscada nem injetada

#### Scenario: Os dois canais se comportam igual
- **WHEN** a mesma mensagem chega pelo WhatsApp e pela web
- **THEN** a mesma técnica é escolhida nas mesmas condições
