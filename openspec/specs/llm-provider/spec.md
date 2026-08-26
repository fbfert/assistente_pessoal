# llm-provider Specification

## Purpose

Permitir que o assistente rode sobre Claude, OpenAI ou DeepSeek sem alteração de código,
trocando apenas variável de ambiente. A Xiax já opera múltiplos provedores em outros produtos e
precisa da mesma liberdade aqui.

## Requirements

### Requirement: Roteamento por provedor

O sistema SHALL expor uma função única de chamada de LLM que recebe system prompt, mensagens e,
opcionalmente, o provedor, e despacha para a implementação correspondente.

O provedor padrão SHALL ser resolvido consultando primeiro as credenciais configuradas e, na
ausência delas, a variável de ambiente. SHALL continuar podendo ser sobrescrito por chamada.

O sistema SHALL exportar a lista de provedores disponíveis.

Uma troca de provedor padrão pela interface SHALL valer sem reinício de processo.

#### Scenario: Troca de provedor sem tocar em código
- **WHEN** a variável de ambiente de provedor muda de `claude` para `deepseek` e o processo
  reinicia
- **THEN** as chamadas passam a ir para DeepSeek sem nenhuma alteração de código

#### Scenario: Troca pela interface vale sem reinício
- **WHEN** o provedor ativo é trocado pela tela de credenciais
- **THEN** a próxima chamada vai para o provedor novo, sem reinício

#### Scenario: Sobrescrita por chamada
- **WHEN** uma chamada informa explicitamente um provedor diferente do padrão
- **THEN** essa chamada usa o provedor informado

### Requirement: Contratos de API por provedor

A chamada a Claude SHALL usar a Anthropic Messages API, autenticando por header
`x-api-key` e enviando o header de versão da API.

As chamadas a OpenAI e DeepSeek SHALL compartilhar uma implementação única no
formato compatível com OpenAI (`/chat/completions`), autenticando por `Bearer`.

A chave e o modelo de cada provedor SHALL ser resolvidos consultando primeiro as
credenciais configuradas e, na ausência delas, a variável de ambiente
correspondente.

Faltando ambas, a chamada SHALL falhar com erro que identifique o provedor e
indique qual variável de ambiente ou qual campo da interface preencher. O sistema
SHALL NOT falhar em silêncio nem recorrer a outro provedor por conta própria.

O erro de resposta do provedor SHALL registrar apenas o provedor e o código de
status. O corpo bruto da resposta SHALL NOT ser incluído na exceção nem em log.

Motivo registrado: alguns provedores ecoam a credencial recebida no corpo do erro
401. Incluir o corpo na exceção coloca a chave no log sem que ninguém tenha pedido.
Filtrar a chave do corpo exigiria acertar o formato de cada provedor a cada mudança
de API, e errar uma vez basta para vazar — por isso o corpo é descartado inteiro.

#### Scenario: Autenticação correta por provedor
- **WHEN** o provedor é `claude`
- **THEN** a requisição carrega `x-api-key` e o header de versão, e não usa `Bearer`

#### Scenario: Credencial configurada tem precedência
- **WHEN** um provedor tem chave configurada e também variável de ambiente
- **THEN** a chave configurada é a usada

#### Scenario: Sem credencial, erro explícito
- **WHEN** um provedor não tem chave configurada nem no ambiente
- **THEN** a chamada falha dizendo qual provedor e onde configurar

#### Scenario: Erro do provedor não carrega o corpo
- **WHEN** o provedor responde com erro
- **THEN** a exceção menciona provedor e código de status, e não contém o corpo da
  resposta

### Requirement: Testabilidade sem rede

A montagem de prompt e o parsing de resposta SHALL ser testáveis sem acesso de rede e sem
chave de API configurada.

Motivo registrado: teste de integração real contra as APIs custa dinheiro e não pode ser
requisito para rodar a suíte.

#### Scenario: Suíte roda sem chave
- **WHEN** `node --test test/` roda sem nenhuma chave de API no ambiente
- **THEN** a suíte passa
