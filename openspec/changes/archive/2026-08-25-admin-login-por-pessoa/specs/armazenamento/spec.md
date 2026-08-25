## ADDED Requirements

### Requirement: Contas de administrador

O sistema SHALL manter a tabela `admin_usuarios` com identificador, nome,
`email` único, `senha_hash`, `ativo`, `criado_em` e `ultimo_login_em`.

Conta inativa SHALL NOT autenticar.

Contas SHALL ser desativadas em vez de removidas, para que a auditoria continue
podendo nomear o autor de ações passadas.

#### Scenario: E-mail duplicado é rejeitado
- **WHEN** uma escrita tenta criar duas contas com o mesmo e-mail
- **THEN** o banco rejeita a segunda

#### Scenario: Conta inativa não entra
- **WHEN** uma conta desativada tenta autenticar com a senha correta
- **THEN** a autenticação é recusada
