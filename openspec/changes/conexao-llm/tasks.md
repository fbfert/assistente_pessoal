## 1. Repositório de credenciais

- [x] 1.1 `src/llm/chavesRepo.js`: `ler(provider)`, `escrever(provider, {apiKey, model})`,
      `status(provider)`
- [x] 1.2 `status` devolve só `{ configurado, ultimosCaracteres, model }` — a chave
      completa nunca sai por essa função
- [x] 1.3 Escrita atômica: arquivo temporário no mesmo diretório e `rename` por cima
- [x] 1.4 Permissão `0600` na criação
- [x] 1.5 Cache em memória validado por `mtime` via `fs.stat` antes de cada uso
- [x] 1.6 Arquivo ausente ou JSON corrompido não derruba o processo: trata como
      "nenhum provedor configurado" e deixa o fallback do ambiente agir

## 2. Router

- [x] 2.1 Resolver chave e modelo pelo repositório antes do ambiente
- [x] 2.2 Erro explícito quando faltam os dois, nomeando provedor, variável e campo
- [x] 2.3 **Parar de incluir o corpo da resposta de erro na exceção** — só provedor
      e código de status
- [x] 2.4 Conferir que nenhum caminho de log ecoa a chave

## 3. Tela

- [x] 3.1 `src/dashboard/rotas/credenciais.js`: uma seção por provedor
- [x] 3.2 Campo de chave sempre vazio ao carregar, mesmo com uma configurada
- [x] 3.3 Status com últimos caracteres e modelo
- [x] 3.4 Provedor ativo visível
- [x] 3.5 Confirmação em duas etapas só ao sobrescrever chave existente
- [x] 3.6 Link na navegação

## 4. Auditoria

- [x] 4.1 Gravação registra provedor, o que mudou e autor
- [x] 4.2 Teste provando que a chave não aparece no registro

## 5. Testes

- [x] 5.1 Fallback para o ambiente quando o arquivo não tem o provedor
- [x] 5.2 Escrita e leitura de volta apenas do status mascarado
- [x] 5.3 Cache respeitando o `mtime`: altera o arquivo e confirma que a leitura
      seguinte pega o valor novo, sem reiniciar o processo no teste
- [x] 5.4 Nenhuma resposta HTTP do admin contém uma chave completa
- [x] 5.5 Erro de provedor não carrega o corpo da resposta
- [x] 5.6 JSON corrompido não derruba o processo

## 6. Modelo por lista curada (item novo)

- [x] 6.1 Lista de modelos conhecidos por provedor, derivada dos padrões de
      `src/config.js` — não redigitada no HTML da tela
- [x] 6.2 `<select>` com a lista mais campo de texto livre **sempre visível** ao lado;
      preenchido, o campo livre vence
- [x] 6.3 Modelo gravado fora da lista aparece como o vigente, sem ser trocado por
      outro na exibição
- [x] 6.4 Sem JavaScript: nada de opção "outro" que revela campo

## 7. Botão de testar (item novo)

- [x] 7.1 `POST /credenciais/:provider/testar`, rota separada da de salvar, atrás da
      mesma autenticação
- [x] 7.2 Nunca escreve no arquivo — nem chave, nem modelo, nem provedor ativo
- [x] 7.3 Usa a chave do formulário quando houver, a gravada quando o campo vier
      vazio; mesma regra para o modelo
- [x] 7.4 Chamada mínima ("responda apenas 'ok'") com teto de tokens baixo
- [x] 7.5 Resultado renderizado no bloco daquele provedor: sucesso com a latência, ou
      a falha — sem a chave e sem o corpo bruto da resposta
- [x] 7.6 Botão ao lado do salvar, em cada seção
- [x] 7.7 Sem auditoria: o teste não muda nada
- [x] 7.8 O corpo do POST com a chave de rascunho não é logado em lugar nenhum

## 8. Provedor ativo e transcrição (itens novos)

- [x] 8.1 `chavesRepo`: `lerAtivo()` e `escreverAtivo(provider)` — chave `ativo` no
      topo do arquivo, fora do mapa de provedores
- [x] 8.2 `chavesRepo`: `transcriptionModel` na entrada do provedor `openai`, padrão
      `gpt-4o-transcribe`
- [x] 8.3 `status('openai')` passa a devolver também o modelo de transcrição
- [x] 8.4 Router resolve o provedor padrão pelo arquivo antes de `LLM_PROVIDER`
- [x] 8.5 `config.transcription.model` resolve pelo arquivo antes de
      `TRANSCRIPTION_MODEL` — sem que nenhum outro módulo passe a ler `process.env`
- [x] 8.6 Tela: rádio único de provedor ativo, compartilhado pelas três seções
- [x] 8.7 Tela: segundo seletor de modelo só na seção OpenAI, com a nota de que usa a
      mesma chave e que a transcrição é sempre OpenAI
- [x] 8.8 Auditoria da troca de provedor ativo
- [x] 8.9 `src/transcription/transcribe.js`: parar de devolver o corpo bruto da
      resposta de erro — só provedor e código de status
- [x] 8.10 Revisar o delta `llm-provider` de `admin-backend-fase2`, que ainda dizia
      que o provedor ativo vem da configuração viva (decisão (f) do design) — o
      delta foi removido de lá, e o motivo ficou registrado no design daquela mudança

## 9. Testes dos itens novos

- [x] 9.1 Campo livre prevalece sobre a opção selecionada
- [x] 9.2 Modelo gravado fora da lista aparece como vigente na tela
- [x] 9.3 Rota de teste usa o rascunho quando fornecido
- [x] 9.4 Rota de teste usa a chave salva quando o campo vem vazio
- [x] 9.5 Rota de teste não altera o arquivo (compara o conteúdo antes e depois)
- [x] 9.6 Falha no teste não expõe a chave nem o corpo da resposta
- [x] 9.7 Modelo de transcrição lido do registro da OpenAI, com fallback para o
      ambiente
- [x] 9.8 Troca de provedor ativo pelo arquivo vale sem reinício
- [x] 9.9 Erro de transcrição não carrega o corpo da resposta
- [x] 9.10 Nenhum teste imprime uma chave em texto claro

## 10. Fechamento

- [ ] 10.1 README: configurar pela tela, `.env` continua valendo, que recriar o
      volume apaga as credenciais junto, e a seção sobre testar, escolher o provedor
      ativo e configurar o modelo de transcrição
- [ ] 10.2 `.env.example`: comentário sobre a alternativa, sem remover as variáveis
- [ ] 10.3 `openspec validate --all` e suíte inteira
- [ ] 10.4 Verificar rodando no Docker, pelo domínio
- [ ] 10.5 Sync, archive e commit local
