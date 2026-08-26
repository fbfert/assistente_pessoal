## ADDED Requirements

### Requirement: Tela de credenciais de LLM

O admin SHALL oferecer uma tela para configurar chave e modelo de cada provedor,
acessível pela navegação e exigindo sessão autenticada.

A tela SHALL permitir escolher qual provedor está ativo para a conversa, num seletor
único, e SHALL indicar a escolha vigente.

Cada provedor SHALL oferecer, lado a lado, a ação de salvar e a ação de testar.

A seção do provedor OpenAI SHALL oferecer também o modelo de transcrição de áudio,
com a declaração de que ele usa a mesma chave daquela seção.

A tela SHALL NOT depender de JavaScript de cliente para nenhuma de suas funções.

Motivo registrado: nenhuma tela deste admin tem JavaScript de cliente — é a mesma
premissa que faz a confirmação de duas etapas ser uma página em GET no lugar de um
`confirm()`. Manter a premissa custa um recarregamento de página no teste e um campo
de texto sempre visível no lugar de um revelado por seleção.

#### Scenario: Acesso autenticado
- **WHEN** alguém sem sessão acessa a tela de credenciais
- **THEN** é redirecionado ao login, e nenhuma informação de credencial é exposta

#### Scenario: Estado de cada provedor visível
- **WHEN** a tela é aberta
- **THEN** cada provedor mostra se está configurado, os últimos caracteres da chave
  quando houver, e o modelo

#### Scenario: Resultado do teste na própria tela
- **WHEN** o operador aciona o teste de um provedor
- **THEN** o resultado aparece no bloco daquele provedor, sem exigir JavaScript

#### Scenario: Transcrição só na seção da OpenAI
- **WHEN** a tela é aberta
- **THEN** o campo de modelo de transcrição aparece apenas na seção da OpenAI
