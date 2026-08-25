## MODIFIED Requirements

### Requirement: Roteamento por provedor

O sistema SHALL expor uma função única de chamada de LLM que recebe system prompt,
mensagens e, opcionalmente, o provedor, e despacha para a implementação
correspondente.

O provedor padrão SHALL vir da configuração viva, que por sua vez recai na variável
de ambiente e depois na constante do código, e SHALL poder ser sobrescrito por
chamada.

Trocar o provedor pela interface SHALL passar a valer sem reinício do processo.

O sistema SHALL exportar a lista de provedores disponíveis.

A chave de API SHALL continuar vindo exclusivamente do ambiente.

#### Scenario: Troca de provedor sem tocar em código
- **WHEN** a variável de ambiente de provedor muda de `claude` para `deepseek` e o
  processo reinicia
- **THEN** as chamadas passam a ir para DeepSeek sem nenhuma alteração de código

#### Scenario: Troca pela interface vale de imediato
- **WHEN** o provedor ativo é alterado na tela de persona
- **THEN** as chamadas seguintes usam o provedor novo, sem reinício

#### Scenario: Sobrescrita por chamada
- **WHEN** uma chamada informa explicitamente um provedor diferente do padrão
- **THEN** essa chamada usa o provedor informado
