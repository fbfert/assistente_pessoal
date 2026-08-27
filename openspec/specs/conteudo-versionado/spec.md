# conteudo-versionado Specification

## Purpose

Tornar editáveis, sem deploy, os textos que definem o comportamento do assistente
— núcleo fixo, variantes de tom, mensagens de gatilho, perguntas da anamnese e o
texto de consentimento — mantendo o conteúdo de hoje como padrão de fábrica.

## Requirements

### Requirement: Conteúdo semeado a partir do código

Na primeira leitura de uma chave ainda ausente do banco, o sistema SHALL semeá-la
com a constante correspondente do código e devolver esse valor.

O comportamento no primeiro dia após a implantação SHALL ser idêntico ao anterior.

A constante do código SHALL permanecer como o padrão de fábrica da chave.

Motivo registrado: manter o valor de fábrica no código é o que torna "restaurar
padrão" possível — restaurar volta à constante, não à linha mais antiga do
histórico, que pode já ser uma edição.

#### Scenario: Dia zero sem mudança de comportamento
- **WHEN** o sistema sobe pela primeira vez com o conteúdo versionado
- **THEN** os textos usados são idênticos aos que estavam no código

#### Scenario: Restaurar padrão de fábrica
- **WHEN** o operador restaura o padrão de uma chave editada
- **THEN** o conteúdo volta a ser a constante do código

### Requirement: Confirmação reforçada para o núcleo fixo

A gravação do núcleo fixo SHALL exigir que o operador digite uma palavra de
confirmação numa segunda etapa antes de a mudança ser aceita.

A gravação SHALL ser recusada quando a palavra não conferir, e nada SHALL ser
alterado.

As demais chaves SHALL usar a confirmação de duas etapas já padronizada.

Motivo registrado: um erro no núcleo altera o comportamento do assistente com
todos os participantes ao mesmo tempo — inclusive as regras de nunca inventar dado
de saúde e nunca agir como terapeuta — e ninguém percebe até alguém receber um
conselho que o sistema não deveria dar.

#### Scenario: Palavra de confirmação errada
- **WHEN** se tenta salvar o núcleo fixo sem a palavra de confirmação correta
- **THEN** a gravação é recusada e o conteúdo permanece

#### Scenario: Confirmação reforçada vale em qualquer caminho
- **WHEN** o núcleo fixo é editado por qualquer tela do admin
- **THEN** a confirmação reforçada continua sendo exigida

### Requirement: A verificação determinística não é editável pela interface

O bloqueio determinístico que impede o assistente de instruir sobre medicação
SHALL NOT ser editável pela interface, e SHALL NOT viver no conteúdo versionado.

Tornar o núcleo fixo editável SHALL NOT afetar essa verificação.

Motivo registrado: a proteção contra instrução de medicação tem duas camadas — a
Regra 1c, que é texto do núcleo fixo, e uma varredura determinística da resposta
antes do envio. Editar o núcleo pela tela pode apagar a primeira; se a segunda também
fosse editável, uma única edição descuidada removeria as duas de uma vez. A segunda
muda por código, com revisão e teste.

#### Scenario: Núcleo esvaziado, bloqueio de pé
- **WHEN** o núcleo fixo é editado a ponto de perder a regra sobre medicação
- **THEN** a verificação determinística continua bloqueando resposta que instrua sobre
  remédio cadastrado do participante

### Requirement: Núcleo fixo não pode ficar vazio

O sistema SHALL recusar gravação de núcleo fixo vazio ou composto apenas de espaço.

#### Scenario: Conteúdo vazio recusado
- **WHEN** se tenta salvar o núcleo fixo em branco
- **THEN** a gravação é recusada

### Requirement: Histórico e reversão de conteúdo

Toda gravação SHALL registrar o conteúdo anterior, o autor e o momento, e SHALL
permitir restaurar qualquer versão anterior.

A reversão SHALL acrescentar uma linha nova ao histórico, sem remover nenhuma.

#### Scenario: Reverter um texto
- **WHEN** o operador restaura uma versão anterior de uma mensagem de gatilho
- **THEN** o conteúdo atual passa a ser o restaurado e o histórico ganha uma linha

### Requirement: Leitura consistente entre processos

O sistema SHALL garantir que uma alteração de conteúdo passe a valer para o
processo do bot sem exigir reinício.

Motivo registrado: o bot e o admin são processos separados, cada um com sua
memória. Cache invalidado apenas na escrita valeria só para o processo que
escreveu, e o bot continuaria mandando mensagem com o texto que o operador acabou
de corrigir — sem que o operador tenha como perceber.

#### Scenario: Edição alcança o bot
- **WHEN** o operador altera a mensagem de um gatilho pela interface
- **THEN** o próximo disparo usa o texto novo, sem reinício do processo do bot
