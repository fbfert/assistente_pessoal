## ADDED Requirements

### Requirement: Nenhuma resposta com instrução de medicação é enviada

Antes de enviar resposta de conversa livre, o núcleo SHALL verificar o texto contra os
nomes de remédio **já cadastrados daquele participante** combinados com verbos de
instrução.

Batendo os dois juntos, a resposta SHALL NOT ser enviada. No lugar, o sistema SHALL
enviar uma mensagem fixa dizendo que essa decisão não é dele e oferecendo outro assunto.

O texto recusado SHALL ser registrado como `resposta_bloqueada_seguranca`.

A verificação SHALL ser determinística e SHALL NOT usar modelo de linguagem para julgar
se a resposta é segura.

A verificação SHALL viver no núcleo e valer igualmente para todos os canais, e
SHALL NOT ser duplicada em nenhum adaptador.

Mensagem de anamnese SHALL NOT passar pela verificação, por ser texto constante do
código e não saída de modelo.

Motivo registrado: modelo de linguagem não obedece regra todas as vezes — muda de
versão, muda de provedor, e uma instrução compete com o resto do contexto. Apostar a
segurança de dado de saúde regulado só no prompt seria construir a proteção no ponto
mais frágil disponível. Usar modelo para vigiar modelo herdaria a mesma falha.

Exigir nome cadastrado **e** verbo é o que separa "comece pelo Vortex agora" de "o
Vortex está no teu cadastro sem horário".

#### Scenario: Instrução de tomar remédio é bloqueada
- **WHEN** o modelo devolve uma resposta mandando a pessoa tomar um remédio que ela tem
  cadastrado
- **THEN** a pessoa recebe a mensagem fixa, e o texto recusado fica registrado

#### Scenario: Resposta sem instrução passa normalmente
- **WHEN** o modelo devolve uma resposta que não instrui sobre medicação
- **THEN** ela é enviada como está, sem registro de bloqueio

#### Scenario: O bloqueio vale nos dois canais
- **WHEN** a mesma resposta perigosa acontece pelo WhatsApp e pelo canal web
- **THEN** os dois são bloqueados do mesmo jeito
