## 1. Contas e hash

- [x] 1.1 Tabela `admin_usuarios` no `schema.sql` (email único, ativo, ultimo_login_em)
- [x] 1.2 `src/dashboard/senha.js`: derivar e verificar com `scrypt` do `node:crypto`,
      formato autodescritivo `scrypt$N$r$p$salt$hash`, sem dependência nova
- [x] 1.3 Verificação de custo equivalente quando o e-mail não existe, para o tempo de
      resposta não enumerar contas
- [x] 1.4 `src/db/adminRepo.js`: buscar por e-mail, criar, marcar último login,
      trocar senha, contar contas

## 2. Login e sessão

- [x] 2.1 Bootstrap na subida: sem nenhuma conta, cria a partir de
      `ADMIN_BOOTSTRAP_EMAIL` + `ADMIN_PASSWORD`; com conta existente, não faz nada
- [x] 2.2 Processo recusa subir sem conta e sem semente
- [x] 2.3 Formulário de login com campo de e-mail e de senha, na mesma rota
- [x] 2.4 Sessão passa a carregar o `admin_id`
- [x] 2.5 Log de falha com e-mail e origem, nunca com a senha
- [x] 2.6 Conta inativa não autentica

## 3. Trocar a própria senha

- [x] 3.1 Rota `/conta` com formulário: senha atual, nova e confirmação
- [x] 3.2 Senha atual incorreta bloqueia a troca
- [x] 3.3 Troca encerra as demais sessões daquela conta
- [x] 3.4 Link para `/conta` na navegação, com o e-mail de quem está logado

## 4. Auditoria com autor

- [x] 4.1 `acoes.js` passa a nomear o administrador no texto da auditoria
- [x] 4.2 Login e troca de senha registrados

## 5. Fechamento

- [x] 5.1 `.env.example` com `ADMIN_BOOTSTRAP_EMAIL` e o novo papel de `ADMIN_PASSWORD`
- [x] 5.2 README: como entrar, as duas camadas, como trocar a senha
- [x] 5.3 Testes: bootstrap, login certo/errado, conta inativa, troca de senha,
      senha nunca em texto claro na resposta, auditoria com autor
- [x] 5.4 `openspec validate --all` e suíte inteira
- [x] 5.5 Verificar rodando no Docker, pelo domínio
- [x] 5.6 Sync, archive e commit local
