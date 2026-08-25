## 1. Schema

- [x] 1.1 Coluna `precisa_trocar_senha INTEGER NOT NULL DEFAULT 0` em `admin_usuarios`
- [x] 1.2 Tabela `auditoria_admin` (autor, alvo, acao, descricao, momento), append-only
- [x] 1.3 Reconfirmar o estado do banco antes de recriar, e recriar

## 2. Repositórios

- [x] 2.1 `src/db/auditoriaAdminRepo.js`: registrar e listar
- [x] 2.2 `adminRepo`: gerar senha temporária, criar com pendência, resetar,
      reativar, contar ativos
- [x] 2.3 Guardas de servidor: não desativar a si mesmo, não desativar o último ativo
- [x] 2.4 Trocar a própria senha limpa a pendência

## 3. Rotas e telas

- [x] 3.1 `/admins`: listagem com ativos e inativos, e formulário de criação
- [x] 3.2 Criar exibe a senha temporária UMA vez
- [x] 3.3 Desativar, reativar e resetar senha, cada um com confirmação
- [x] 3.4 Reset encerra as sessões da conta alvo
- [x] 3.5 Middleware desvia sessão com pendência para `/conta`
- [x] 3.6 Link na navegação

## 4. Auditoria

- [x] 4.1 Criar, desativar, reativar e resetar registram em `auditoria_admin`
- [x] 4.2 A senha gerada nunca entra no log
- [x] 4.3 Ação de equipe não escreve em `historico_interacoes`

## 5. Fechamento

- [x] 5.1 Testes de tudo acima
- [x] 5.2 README e `.env.example` se necessário
- [x] 5.3 `openspec validate --all` e suíte inteira
- [x] 5.4 Verificar no Docker, pelo domínio
- [x] 5.5 Sync, archive e commit local
