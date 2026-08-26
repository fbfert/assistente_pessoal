## MODIFIED Requirements

### Requirement: Log de auditoria da equipe

O sistema SHALL manter a tabela `auditoria_admin`, append-only, com autor, conta
alvo, ação, descrição e momento.

A lista de ações SHALL incluir a configuração de credencial de provedor de LLM.

Ações sobre participantes SHALL continuar em `historico_interacoes`, e SHALL NOT
migrar para este log.

Alterar a lista fechada de ações SHALL ser feito por script de migração idempotente
quando o banco já contiver dados, e SHALL NOT ser feito por recriação do volume.

Motivo registrado: `historico_interacoes.usuario_id` é obrigatório e referencia um
participante; configurar uma credencial não tem participante associado. Quanto à
migração — o banco passou a conter a conta de administrador com a senha definida
pelo operador, e recriar o volume faria o bootstrap restaurá-la a partir do
ambiente, desfazendo a troca em silêncio.

#### Scenario: Ação de equipe não polui a linha do tempo do participante
- **WHEN** uma conta de administrador é criada
- **THEN** nenhuma linha é acrescentada a `historico_interacoes`

#### Scenario: Autor preservado após desativação
- **WHEN** a conta que executou uma ação é depois desativada
- **THEN** o registro de auditoria continua identificando o autor

#### Scenario: Configuração de credencial é registrável
- **WHEN** a credencial de um provedor é configurada
- **THEN** o banco aceita o registro dessa ação

#### Scenario: Migração idempotente
- **WHEN** o script de migração roda num banco que já tem a ação disponível
- **THEN** nada é alterado
