# llm-provider Specification

## Purpose

Permitir que o assistente rode sobre Claude, OpenAI ou DeepSeek sem alteração de código,
trocando apenas variável de ambiente. A Xiax já opera múltiplos provedores em outros produtos e
precisa da mesma liberdade aqui.

## Requirements

### Requirement: Roteamento por provedor

O sistema SHALL expor uma função única de chamada de LLM que recebe system prompt, mensagens e,
opcionalmente, o provedor, e despacha para a implementação correspondente.

O provedor padrão SHALL vir da configuração, alimentada por variável de ambiente, e SHALL poder
ser sobrescrito por chamada.

O sistema SHALL exportar a lista de provedores disponíveis.

#### Scenario: Troca de provedor sem tocar em código
- **WHEN** a variável de ambiente de provedor muda de `claude` para `deepseek` e o processo
  reinicia
- **THEN** as chamadas passam a ir para DeepSeek sem nenhuma alteração de código

#### Scenario: Sobrescrita por chamada
- **WHEN** uma chamada informa explicitamente um provedor diferente do padrão
- **THEN** essa chamada usa o provedor informado

### Requirement: Contratos de API por provedor

A chamada a Claude SHALL usar a Anthropic Messages API, autenticando por header `x-api-key` e
enviando o header de versão da API.

As chamadas a OpenAI e DeepSeek SHALL compartilhar uma implementação única no formato
compatível com OpenAI (`/chat/completions`), autenticando por `Bearer`.

#### Scenario: Autenticação correta por provedor
- **WHEN** o provedor é `claude`
- **THEN** a requisição carrega `x-api-key` e o header de versão, e não usa `Bearer`

### Requirement: Testabilidade sem rede

A montagem de prompt e o parsing de resposta SHALL ser testáveis sem acesso de rede e sem
chave de API configurada.

Motivo registrado: teste de integração real contra as APIs custa dinheiro e não pode ser
requisito para rodar a suíte.

#### Scenario: Suíte roda sem chave
- **WHEN** `node --test test/` roda sem nenhuma chave de API no ambiente
- **THEN** a suíte passa
