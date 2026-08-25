## Why

Existe uma conta de administrador só — a que o bootstrap criou. Para a equipe
Xiax inteira operar o piloto, hoje o caminho é compartilhar essa credencial, que
é exatamente o que o login por pessoa foi construído para evitar: com senha
compartilhada, a auditoria volta a não saber quem agiu.

Falta também o caminho de volta quando alguém perde a senha. Não há servidor de
e-mail transacional, então "recuperar por link" não existe. Sem nenhuma
alternativa, perder a senha significa editar variável de ambiente e recriar o
banco.

## What Changes

- Tela de administradores: listar ativos e inativos, criar e desativar.
- Criação gera **senha temporária** exibida uma única vez, e a conta é obrigada a
  trocá-la no primeiro acesso.
- Reset de senha por outro administrador ativo — é o mecanismo de recuperação,
  no lugar do e-mail que não existe.
- Desativar em vez de excluir, com guardas contra o operador se trancar para fora.
- Auditoria de ações sobre a equipe em log próprio, separado da linha do tempo
  dos participantes.

## Capabilities

### New Capabilities

- `admin-contas`: criação, desativação, reativação e reset de senha de contas de
  administrador, e a obrigação de trocar a senha temporária no primeiro acesso.

### Modified Capabilities

- `armazenamento`: coluna `precisa_trocar_senha` em `admin_usuarios` e a tabela
  `auditoria_admin`.
- `admin-autenticacao`: sessão com senha temporária pendente fica restrita à
  troca de senha.

## Impact

- **Código:** `src/db/schema.sql`, `src/db/adminRepo.js`,
  `src/db/auditoriaAdminRepo.js` (novo), `src/dashboard/rotas/admins.js` (novo),
  `src/dashboard/rotas/conta.js`, `src/dashboard/auth.js`, `src/dashboard/html.js`.
- **Dependências:** nenhuma.
- **Schema:** uma coluna e uma tabela novas.
- **Fora de escopo:** papéis e permissões — todo administrador continua vendo e
  editando tudo, por decisão registrada.
