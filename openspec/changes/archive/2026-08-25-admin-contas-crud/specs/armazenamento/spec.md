## MODIFIED Requirements

### Requirement: Contas de administrador

O sistema SHALL manter a tabela `admin_usuarios` com identificador, nome,
`email` único, `senha_hash`, `ativo`, `precisa_trocar_senha`, `criado_em` e
`ultimo_login_em`.

Conta inativa SHALL NOT autenticar.

Contas SHALL ser desativadas em vez de removidas, para que a auditoria continue
podendo nomear o autor de ações passadas.

#### Scenario: E-mail duplicado é rejeitado
- **WHEN** uma escrita tenta criar duas contas com o mesmo e-mail
- **THEN** o banco rejeita a segunda

#### Scenario: Conta inativa não entra
- **WHEN** uma conta desativada tenta autenticar com a senha correta
- **THEN** a autenticação é recusada

## ADDED Requirements

### Requirement: Log de auditoria da equipe

O sistema SHALL manter a tabela `auditoria_admin`, append-only, com autor, conta
alvo, ação, descrição e momento.

Ações sobre participantes SHALL continuar em `historico_interacoes`, e SHALL NOT
migrar para este log.

Motivo registrado: `historico_interacoes.usuario_id` é obrigatório e referencia um
participante; criar um administrador não tem participante associado. Tornar a
coluna anulável enfraqueceria a chave estrangeira e quebraria a premissa de toda
consulta existente, que assume a linha do tempo de uma pessoa. Inventar um
participante-sistema colocaria dado falso na contagem do painel. A separação é
semântica: quem abre a página de um participante quer o que aconteceu com ele.

#### Scenario: Ação de equipe não polui a linha do tempo do participante
- **WHEN** uma conta de administrador é criada
- **THEN** nenhuma linha é acrescentada a `historico_interacoes`

#### Scenario: Autor preservado após desativação
- **WHEN** a conta que executou uma ação é depois desativada
- **THEN** o registro de auditoria continua identificando o autor
