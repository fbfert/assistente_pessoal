## Why

O operador ficou trancado para fora do backend. A causa não foi bug: foram duas
credenciais diferentes para a mesma tela.

O Apache pede Basic Auth (`fbfert@gmail.com` + senha), e logo depois a aplicação
pedia uma segunda senha — uma string aleatória gerada no deploy, que ninguém
tinha motivo para saber — num formulário **sem campo de usuário**. Quem chega na
tela não tem como adivinhar que a senha é outra.

Há também um problema de fundo que a senha única carrega: ela não identifica
ninguém. O log de auditoria registra "via admin" sem dizer *qual* pessoa da
equipe fez a alteração — sobre dado de saúde de participantes identificados.

## What Changes

- Contas de administrador em tabela, com e-mail e senha por pessoa.
- Login passa a ser **e-mail + senha**, na mesma rota que já existe.
- Bootstrap na primeira subida: a conta inicial nasce das variáveis de ambiente,
  para que ninguém fique trancado para fora no deploy.
- Cada administrador troca a própria senha, informando a atual antes.
- A auditoria passa a identificar **quem** fez cada ação.
- `ADMIN_PASSWORD` deixa de ser credencial de login e passa a ser apenas semente
  do bootstrap.

## Capabilities

### Modified Capabilities

- `admin-autenticacao`: login por e-mail e senha de conta persistida, em vez de
  senha única de processo; bootstrap; troca da própria senha.
- `admin-auditoria`: cada linha de auditoria identifica o administrador autor.
- `armazenamento`: tabela `admin_usuarios`.

## Impact

- **Código:** `src/db/schema.sql`, `src/db/adminRepo.js` (novo),
  `src/dashboard/auth.js`, `src/dashboard/rotas/login.js`,
  `src/dashboard/rotas/conta.js` (novo), `src/dashboard/rotas/acoes.js`.
- **Variáveis:** `ADMIN_BOOTSTRAP_EMAIL` (nova). `ADMIN_PASSWORD` muda de papel.
- **Dependências:** nenhuma. O hash usa `node:crypto` (`scrypt`), que já vem no
  Node — evita `bcrypt`, que é binário nativo, num projeto que já paga esse
  custo com `better-sqlite3`.
- **Fora de escopo:** criar e desativar outros administradores pela interface,
  e recuperação de acesso sem outro administrador. Ficam para a fase seguinte.
