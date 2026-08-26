## Purpose

Tirar do código os parâmetros que o piloto existe para calibrar — janelas,
limiares e horários padrão — para que ajustá-los seja questão de segundos na
interface, com autor registrado e caminho de volta.

## ADDED Requirements

### Requirement: Ordem de leitura em três degraus

A leitura de uma chave de configuração SHALL seguir, nesta ordem: o valor
armazenado no banco; a variável de ambiente correspondente, quando existir; e a
constante do código.

Nenhuma chave SHALL ficar sem valor por ausência de configuração.

Motivo registrado: parte das chaves nunca teve variável de ambiente — os horários
padrão de gatilho sempre foram constantes exportadas do código. Um fallback de
dois degraus deixaria essas chaves sem valor num banco recém-criado.

#### Scenario: Chave ainda não configurada
- **WHEN** uma chave é lida e não existe no banco nem no ambiente
- **THEN** o valor devolvido é a constante do código

#### Scenario: Banco tem precedência sobre ambiente
- **WHEN** a chave existe no banco e também numa variável de ambiente
- **THEN** o valor do banco é o usado

### Requirement: Validação por tipo antes de aceitar

O sistema SHALL validar o valor novo conforme o tipo da chave antes de gravá-lo, e
SHALL recusar valor inválido sem alterar o que está armazenado.

Chave numérica SHALL ser validada contra uma faixa declarada.

Chave de horário SHALL ser aceita apenas no formato de vinte e quatro horas com
hora e minuto.

#### Scenario: Número fora da faixa
- **WHEN** se tenta gravar um limiar de silêncio negativo
- **THEN** a gravação é recusada e o valor anterior permanece

#### Scenario: Horário malformado
- **WHEN** se tenta gravar um horário que não segue o formato esperado
- **THEN** a gravação é recusada

### Requirement: Chave de API nunca entra na configuração viva

O sistema SHALL NOT expor, aceitar nem armazenar chave de API de provedor na
configuração editável.

A chave SHALL permanecer fora do banco.

Motivo registrado: a configuração editável é lida e escrita pela interface e fica
no banco, que é copiado em backup, lido por dois processos e tem "ver histórico"
como funcionalidade. Segredo de terceiro não pertence a esse ciclo — ele vive num
arquivo próprio do volume, sem histórico e sem reversão (mudança `conexao-llm`).

#### Scenario: Nenhuma chave na tela de configuração
- **WHEN** a tela de configuração é exibida
- **THEN** nenhum campo de chave de API aparece

#### Scenario: Nenhuma chave no banco
- **WHEN** a configuração viva é lida por inteiro
- **THEN** nenhuma chave de API está entre os valores armazenados

### Requirement: Histórico de toda mudança

Toda gravação SHALL acrescentar ao histórico o valor anterior, quem alterou e
quando.

O histórico SHALL ser append-only.

#### Scenario: Autor e valor anterior preservados
- **WHEN** uma chave é alterada
- **THEN** o histórico registra o valor que havia antes e o administrador que alterou

### Requirement: Reversão é uma escrita nova

O sistema SHALL permitir restaurar qualquer valor presente no histórico de uma
chave.

A reversão SHALL gravar o valor restaurado como atual **e** acrescentar uma linha
nova ao histórico.

A reversão SHALL NOT remover nem alterar linhas anteriores do histórico.

Motivo registrado: o rastro precisa mostrar que houve uma reversão, não fingir que
a mudança nunca aconteceu.

#### Scenario: Reverter preserva o rastro
- **WHEN** um valor é revertido para uma versão anterior
- **THEN** o valor atual passa a ser o restaurado e o histórico ganha uma linha,
  sem perder nenhuma

### Requirement: Mudança de configuração é auditada

Toda gravação e reversão SHALL gerar registro de auditoria no mesmo padrão já usado
pelas demais ações do operador.

#### Scenario: Auditoria da alteração
- **WHEN** o operador altera uma chave
- **THEN** existe registro de auditoria identificando a chave, os valores e o autor
