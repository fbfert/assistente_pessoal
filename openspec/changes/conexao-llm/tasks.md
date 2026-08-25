## 1. Repositório de credenciais

- [ ] 1.1 `src/llm/chavesRepo.js`: `ler(provider)`, `escrever(provider, {apiKey, model})`,
      `status(provider)`
- [ ] 1.2 `status` devolve só `{ configurado, ultimosCaracteres, model }` — a chave
      completa nunca sai por essa função
- [ ] 1.3 Escrita atômica: arquivo temporário no mesmo diretório e `rename` por cima
- [ ] 1.4 Permissão `0600` na criação
- [ ] 1.5 Cache em memória validado por `mtime` via `fs.stat` antes de cada uso
- [ ] 1.6 Arquivo ausente ou JSON corrompido não derruba o processo: trata como
      "nenhum provedor configurado" e deixa o fallback do ambiente agir

## 2. Router

- [ ] 2.1 Resolver chave e modelo pelo repositório antes do ambiente
- [ ] 2.2 Erro explícito quando faltam os dois, nomeando provedor, variável e campo
- [ ] 2.3 **Parar de incluir o corpo da resposta de erro na exceção** — só provedor
      e código de status
- [ ] 2.4 Conferir que nenhum caminho de log ecoa a chave

## 3. Tela

- [ ] 3.1 `src/dashboard/rotas/credenciais.js`: uma seção por provedor
- [ ] 3.2 Campo de chave sempre vazio ao carregar, mesmo com uma configurada
- [ ] 3.3 Status com últimos caracteres e modelo
- [ ] 3.4 Provedor ativo visível
- [ ] 3.5 Confirmação em duas etapas só ao sobrescrever chave existente
- [ ] 3.6 Link na navegação

## 4. Auditoria

- [ ] 4.1 Gravação registra provedor, o que mudou e autor
- [ ] 4.2 Teste provando que a chave não aparece no registro

## 5. Testes

- [ ] 5.1 Fallback para o ambiente quando o arquivo não tem o provedor
- [ ] 5.2 Escrita e leitura de volta apenas do status mascarado
- [ ] 5.3 Cache respeitando o `mtime`: altera o arquivo e confirma que a leitura
      seguinte pega o valor novo, sem reiniciar o processo no teste
- [ ] 5.4 Nenhuma resposta HTTP do admin contém uma chave completa
- [ ] 5.5 Erro de provedor não carrega o corpo da resposta
- [ ] 5.6 JSON corrompido não derruba o processo

## 6. Fechamento

- [ ] 6.1 README: configurar pela tela, `.env` continua valendo, e que recriar o
      volume apaga as credenciais junto
- [ ] 6.2 `.env.example`: comentário sobre a alternativa, sem remover as variáveis
- [ ] 6.3 `openspec validate --all` e suíte inteira
- [ ] 6.4 Verificar rodando no Docker, pelo domínio
- [ ] 6.5 Sync, archive e commit local
