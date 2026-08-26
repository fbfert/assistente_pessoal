## Purpose

Fazer o perfil da pessoa acumular depois do dia 1, sem pergunta extra, sem
sobrescrever o que ela respondeu sob consentimento formal, e sem transformar comentário
de um dia em traço permanente.

## ADDED Requirements

### Requirement: Nota aprendida empilha, nunca substitui

O sistema SHALL registrar o que aprende depois da anamnese como nota nova, associada a
um campo, em armazenamento próprio.

O sistema SHALL NOT alterar, sobrescrever ou apagar a resposta original da anamnese em
razão de um aprendizado posterior.

Motivo registrado: o que a pessoa respondeu no dia 1 foi dito sob consentimento
formal e é fato datado. O que se aprende depois é inferência de conversa, sem a mesma
confiabilidade e sem consentimento específico para aquele item. Sobrescrever apagaria
a distinção — e com ela a resposta para "isso ela disse ou o bot deduziu?".

#### Scenario: Aprendizado não apaga a anamnese
- **WHEN** o sistema aprende algo novo sobre um campo que já tem resposta de anamnese
- **THEN** a resposta original permanece intacta e a nota é acrescentada à parte

#### Scenario: Notas se acumulam no mesmo campo
- **WHEN** o sistema aprende duas coisas diferentes sobre o mesmo campo, em dias
  diferentes
- **THEN** as duas notas coexistem, cada uma com sua data

### Requirement: Escopo fechado de campos aprendíveis

Os campos elegíveis SHALL ser derivados da whitelist de campos de anamnese, excluído o
campo de nome, e SHALL ser expostos como constante congelada exportada de um lugar só.

O sistema SHALL NOT derivar essa lista por cópia manual da whitelist existente.

O armazenamento SHALL recusar nota cujo campo não pertença a essa lista.

#### Scenario: Campo fora da lista é recusado
- **WHEN** uma gravação tenta registrar nota num campo que não é elegível
- **THEN** a gravação é recusada

#### Scenario: Nome nunca é aprendido
- **WHEN** a extração devolve o campo de nome
- **THEN** nada é gravado

### Requirement: Remédio nunca passa por este mecanismo

O prompt de extração SHALL instruir explicitamente que nome, dose e horário de remédio
não são capturáveis por este caminho.

O sistema SHALL NOT gravar nota cujo conteúdo tenha sido devolvido para um campo
qualquer contendo dado de medicação.

Motivo registrado: remédio tem extração própria, com tratamento de Regra 1b específico
para dado de saúde regulado. O risco real não é o campo `remedio` entrar na lista de
elegíveis — ele não existe lá. É o modelo devolver "ela toma o remédio de manhã"
rotulado como rotina, burlando por fora um mecanismo que é estrito de propósito.

#### Scenario: Mensagem sobre remédio não vira nota
- **WHEN** a pessoa menciona um remédio numa mensagem de chat livre
- **THEN** nenhuma nota é criada por este mecanismo, e o registro de remédio continua
  sendo feito apenas pelo caminho já existente

### Requirement: Captura conservadora de padrão, não de episódio

A extração SHALL capturar apenas o que a pessoa disse **sobre si mesma** e descreveu
como **geral ou recorrente**.

A extração SHALL NOT inferir traço a partir de queixa pontual, de evento de um dia, nem
de opinião sobre terceiros.

Diante de dúvida entre queixa pontual e padrão recorrente, o sistema SHALL não capturar.

Motivo registrado: aqui o risco não é inventar dado — é generalizar dado verdadeiro.
"Hoje o trânsito me deixou louco" virando "gatilho de sobrecarga: trânsito" produz um
traço falso que se propaga silenciosamente para toda mensagem seguinte. Perder uma nota
é recuperável; um traço falso no perfil, não — ninguém percebe que ele está lá.

#### Scenario: Padrão recorrente vira nota
- **WHEN** a pessoa diz que barulho de obra sempre a derruba, como algo que se repete
- **THEN** uma nota é criada no campo de gatilhos de sobrecarga

#### Scenario: Queixa pontual não vira nota
- **WHEN** a pessoa reclama de algo que aconteceu hoje, sem descrever como padrão
- **THEN** nenhuma nota é criada

### Requirement: Não reaprender o que já está registrado

A extração SHALL receber o perfil já conhecido — respostas da anamnese e notas ativas
do participante — e SHALL NOT capturar o que já esteja registrado.

#### Scenario: Repetição do que já se sabe
- **WHEN** a pessoa repete algo que já consta da anamnese ou de uma nota ativa
- **THEN** nenhuma nota nova é criada

### Requirement: Aprendizado só no chat livre

A extração SHALL rodar apenas para participante com a anamnese concluída.

O sistema SHALL NOT rodar a extração durante qualquer estado da anamnese.

Motivo registrado: na anamnese o fluxo já é pergunta dirigida com campo de destino
conhecido. Uma segunda captura ali gravaria em paralelo à máquina de estados, sem que
nada reconciliasse as duas.

#### Scenario: Participante em anamnese
- **WHEN** chega mensagem de participante que ainda não concluiu a anamnese
- **THEN** nenhuma extração de aprendizado é disparada

### Requirement: Falha da extração nunca alcança a pessoa

Falha na chamada de LLM da extração, resposta que não seja JSON válido, ou JSON com
formato inesperado SHALL ser tratados como "não aprendeu nada".

Nenhuma dessas situações SHALL impedir, atrasar ou alterar a resposta enviada ao
participante.

O sistema SHALL NOT enviar ao participante qualquer mensagem originada de erro da
extração.

#### Scenario: LLM de extração falha
- **WHEN** a chamada de extração lança erro
- **THEN** a resposta normal é enviada ao participante do mesmo jeito e nenhuma nota é
  criada

#### Scenario: Resposta malformada
- **WHEN** a extração devolve algo que não é o JSON esperado
- **THEN** nada é gravado e nada é enviado ao participante

### Requirement: Remoção por soft delete, auditada

O operador SHALL poder remover uma nota pela página do participante, com confirmação em
duas etapas.

A remoção SHALL marcar a nota como removida, registrando o momento e o autor, e
SHALL NOT apagar a linha.

Nota removida SHALL deixar de compor o contexto do system prompt e SHALL continuar
recuperável no banco.

#### Scenario: Nota removida sai do contexto
- **WHEN** o operador remove uma nota
- **THEN** o system prompt seguinte não a contém

#### Scenario: Remoção preserva o registro
- **WHEN** uma nota é removida
- **THEN** a linha continua no banco, marcada com o momento e o autor da remoção

### Requirement: Rastreabilidade sem duplicar dado sensível

Cada nota SHALL apontar para a interação de onde saiu, por referência.

O sistema SHALL NOT copiar o texto integral da mensagem de origem para a nota nem para
a linha de auditoria.

A auditoria de criação e de remoção SHALL registrar o campo e o texto da nota.

Motivo registrado: a mensagem de origem pode conter outro dado sensível não relacionado
ao que foi aprendido. Copiá-la criaria uma segunda cópia desse dado, que a anonimização
teria que lembrar de redigir em mais um lugar.

#### Scenario: Auditoria não carrega a mensagem inteira
- **WHEN** uma nota é criada a partir de uma mensagem longa
- **THEN** a linha de auditoria contém o campo e o texto da nota, não a mensagem
