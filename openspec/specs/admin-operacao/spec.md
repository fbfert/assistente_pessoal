# admin-operacao Specification

## Purpose

Dar ao operador do piloto as ações que hoje só existem como SQL manual ou
`docker compose exec`: convidar, corrigir, ligar e desligar gatilho, dar segunda
chance, pausar e retirar alguém do piloto — sem abrir o banco na mão.

## Requirements

### Requirement: Convidar piloto novo

O admin SHALL oferecer um formulário de convite que recebe um número de WhatsApp e
executa o convite proativo.

A ação SHALL ser oferecida apenas quando o número não existir no banco, ou existir com
`anamnese_estado = 0` e sem consentimento aceito.

O sistema SHALL NOT oferecer essa ação sobre usuário com qualquer progresso de
anamnese.

Motivo registrado: o convite reseta o estado da anamnese incondicionalmente. Restrito a
esse recorte, não há progresso a perder.

#### Scenario: Número novo pode ser convidado
- **WHEN** o operador informa um número que não existe no banco
- **THEN** o usuário é criado no estado 0 e recebe o texto de consentimento

#### Scenario: Usuário com progresso não recebe a ação de convite
- **WHEN** a página de um usuário no estado 5 é exibida
- **THEN** a ação de convidar não é oferecida para ele

### Requirement: Reiniciar anamnese

O admin SHALL oferecer uma ação de reiniciar anamnese, disponível para qualquer
usuário, marcada como destrutiva.

A ação SHALL limpar todos os campos de resposta da anamnese, remover os remédios
cadastrados e os gatilhos configurados, e retornar o estado a 0.

A ação SHALL NOT reaproveitar o convite proativo como implementação.

Motivo registrado: o convite apenas reseta o estado, deixando respostas antigas em
campos que a nova anamnese pode não regravar — um registro meio-antigo meio-novo, pior
que qualquer um dos dois.

#### Scenario: Reinício limpa o que foi coletado
- **WHEN** a anamnese de um usuário concluído é reiniciada
- **THEN** os campos de resposta ficam vazios, os remédios e gatilhos são removidos, e o
  estado volta a 0

### Requirement: Editar campo de anamnese

O admin SHALL permitir editar qualquer campo pertencente à whitelist de campos de
anamnese já existente.

A validação do nome do campo SHALL ser a da função de gravação já existente, sem
reimplementação na camada de rota.

#### Scenario: Campo fora da whitelist é recusado
- **WHEN** uma requisição tenta gravar um campo que não pertence à whitelist
- **THEN** a gravação é recusada e nada é alterado

### Requirement: Editar e remover remédio

O admin SHALL permitir editar nome e horário de um remédio, e removê-lo.

Quando um campo vier vazio no formulário, o valor gravado SHALL ser a constante
sentinela de ausência de informação, importada do módulo único que a declara.

O admin SHALL NOT gravar valor arbitrário como se fosse dado confirmado quando o
operador não informou nada.

#### Scenario: Horário apagado vira sentinela
- **WHEN** o operador salva um remédio com o campo de horário vazio
- **THEN** o horário gravado é a constante sentinela, e o gatilho correspondente deixa de
  ser elegível

### Requirement: Ativar, desativar e reagendar gatilho

O admin SHALL permitir ativar e desativar um gatilho individual, e alterar seu horário.

#### Scenario: Ativar o checklist de fim de dia
- **WHEN** o operador ativa o gatilho que nasce desligado
- **THEN** ele passa a constar entre os gatilhos ativos do usuário

#### Scenario: Alterar horário
- **WHEN** o operador altera o horário de um gatilho
- **THEN** o disparo passa a ocorrer no novo horário

### Requirement: Zerar contador de silêncio

O admin SHALL permitir zerar o contador de silêncios consecutivos de um tipo de gatilho
de um usuário.

#### Scenario: Segunda chance sem esperar resposta
- **WHEN** o operador zera o contador de um usuário que estava acima do limiar
- **THEN** o próximo disparo daquele tipo volta a usar o tom normal

### Requirement: Pausar e despausar usuário

O admin SHALL permitir pausar e despausar um usuário.

Pausar SHALL suspender todos os disparos daquele usuário sem desativar nem apagar
gatilho algum.

Despausar SHALL restaurar exatamente o conjunto de gatilhos que estava ativo antes da
pausa.

#### Scenario: Pausa suspende sem alterar configuração
- **WHEN** um usuário com gatilhos ativos é pausado
- **THEN** ele não recebe disparo, e a configuração dos seus gatilhos permanece intacta

#### Scenario: Despausar restaura o estado anterior
- **WHEN** um usuário pausado é despausado
- **THEN** volta a receber exatamente os gatilhos que estavam ativos antes

### Requirement: Confirmação em duas etapas para ação destrutiva

Toda ação destrutiva — reiniciar anamnese, anonimizar participante e remover remédio —
SHALL passar por uma página intermediária de confirmação antes da submissão final.

A página de confirmação SHALL descrever o efeito concreto da ação e SHALL NOT alterar
nenhum dado.

Motivo registrado: o projeto não usa JavaScript de cliente, então não há diálogo de
confirmação do navegador. A página intermediária cumpre esse papel.

#### Scenario: Abrir a confirmação não altera nada
- **WHEN** a página de confirmação de uma ação destrutiva é carregada
- **THEN** nenhum dado é alterado, e recarregar a página continua sendo inofensivo

### Requirement: Sem JavaScript de cliente

Toda ação do admin SHALL ser server-rendered, por formulário HTML com submissão por
POST.

O admin SHALL NOT depender de JavaScript de cliente para nenhuma de suas funções.

#### Scenario: Operação com script desabilitado
- **WHEN** o operador usa o admin com JavaScript desabilitado
- **THEN** todas as ações continuam funcionando

### Requirement: Trocar a personalidade do participante

O admin SHALL permitir trocar a personalidade de um participante entre os três
valores aceitos.

A ação SHALL oferecer apenas os valores válidos como opções fechadas, e SHALL NOT
aceitar texto livre.

A ação SHALL usar a função de gravação já existente, e SHALL NOT ser encaixada no
formulário genérico de campos de anamnese.

Motivo registrado: a personalidade tem CHECK próprio no schema e não pertence à
whitelist de campos de anamnese. Tratá-la como campo de texto livre permitiria
tentar gravar valor inválido e receber erro de banco em vez de recusa na
interface. Trocar importa porque o estado 10 da anamnese assume `neutro` quando
a resposta não é reconhecida — existe um caminho conhecido em que a pessoa fica
com um tom que não escolheu.

#### Scenario: Troca aplicada
- **WHEN** o operador escolhe outra personalidade para um participante
- **THEN** o valor gravado é o escolhido, e as mensagens seguintes usam o novo tom

#### Scenario: Valor inválido é recusado
- **WHEN** chega uma requisição com personalidade fora dos três valores
- **THEN** a gravação é recusada e o valor anterior permanece

#### Scenario: A troca é auditada
- **WHEN** a personalidade é trocada
- **THEN** uma linha de auditoria registra o valor anterior, o novo e quem trocou
