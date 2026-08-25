# classificacao-mensagem Specification

## Purpose

Decidir se uma mensagem recebida é resposta a um gatilho ou um despejo espontâneo, para que o
histórico e as métricas do piloto separem as duas coisas. Decisão puramente heurística, sem
custo de LLM.

## Requirements

### Requirement: Classificação por janela temporal

A classificação SHALL ser uma função pura, sem chamada de LLM e sem acesso a banco, recebendo o
instante atual, o último gatilho disparado para o usuário e a janela em minutos.

Quando existir um último gatilho e o intervalo entre ele e o instante atual estiver dentro da
janela, a classificação SHALL ser `resposta_gatilho`.

Caso contrário, a classificação SHALL ser `despejo_espontaneo`.

A janela SHALL ser configurável por variável de ambiente, com padrão de 120 minutos.

#### Scenario: Sem gatilho anterior
- **WHEN** não há gatilho disparado para o usuário
- **THEN** a mensagem é `despejo_espontaneo`

#### Scenario: Dentro da janela
- **WHEN** a mensagem chega 30 minutos após o gatilho, com janela de 120 minutos
- **THEN** a mensagem é `resposta_gatilho`

#### Scenario: Fora da janela
- **WHEN** a mensagem chega 200 minutos após o gatilho, com janela de 120 minutos
- **THEN** a mensagem é `despejo_espontaneo`

#### Scenario: Exatamente no limite
- **WHEN** a mensagem chega exatamente 120 minutos após o gatilho, com janela de 120 minutos
- **THEN** a mensagem é `resposta_gatilho`, porque o limite é inclusivo

### Requirement: Simplificação declarada da janela

A classificação SHALL NOT distinguir a primeira da segunda mensagem dentro da mesma janela:
ambas contam como resposta ao mesmo gatilho.

Essa simplificação SHALL estar documentada em comentário no próprio módulo.

Motivo registrado: na escala do piloto, a distinção não muda nenhuma decisão de produto.

#### Scenario: Duas mensagens na mesma janela
- **WHEN** o usuário manda duas mensagens dentro da mesma janela após um gatilho
- **THEN** ambas são classificadas como `resposta_gatilho`
