## ADDED Requirements

### Requirement: Tela de credenciais de LLM

O admin SHALL oferecer uma tela para configurar chave e modelo de cada provedor,
acessível pela navegação e exigindo sessão autenticada.

A tela SHALL indicar qual provedor está ativo para a conversa.

#### Scenario: Acesso autenticado
- **WHEN** alguém sem sessão acessa a tela de credenciais
- **THEN** é redirecionado ao login, e nenhuma informação de credencial é exposta

#### Scenario: Estado de cada provedor visível
- **WHEN** a tela é aberta
- **THEN** cada provedor mostra se está configurado, os últimos caracteres da chave
  quando houver, e o modelo
