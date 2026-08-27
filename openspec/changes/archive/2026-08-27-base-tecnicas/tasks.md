# Tarefas — Base de técnicas práticas

## 1. Schema e migração

- [x] 1.1 `temas_tecnicas` (chave única, rótulo, palavras_gatilho, criado_em) no
      `src/db/schema.sql`.
- [x] 1.2 `tecnicas` (tema FK, titulo, texto, fonte, status, criado_em, aprovado_em,
      aprovado_por FK `admin_usuarios`, ultima_sugerida_em) com CHECK de status e
      índice em (`tema`, `status`).
- [x] 1.3 `tecnica_sugerida` em `TIPOS_INTERACAO` e no CHECK de `historico_interacoes`.
- [x] 1.4 Migração em `src/db/migracoes.js`: as duas tabelas por `CREATE TABLE IF NOT
      EXISTS`, e o CHECK ampliado pelo procedimento já usado duas vezes — transação,
      chaves estrangeiras desligadas, contagem antes e depois, idempotente.

## 2. Repositórios

- [x] 2.1 `src/conhecimento/temasRepo.js`: `listarTemas`, `obterTema`, `criarTema`,
      `atualizarTema`, `removerTema`, `palavrasGatilho`.
- [x] 2.2 `src/conhecimento/tecnicasRepo.js`: `listar`, `obter`, `criar`, `atualizar`,
      `publicar`, `arquivar`, `publicadasPorTema`.
- [x] 2.3 Validação no repositório, não na rota: tema existente, fonte obrigatória,
      texto obrigatório, status da lista fechada.
- [x] 2.4 `escolherParaTema`: só `publicada`, ordem por `ultima_sugerida_em` com nulo
      primeiro, desempate por id, e marcação da sugestão na mesma operação.
- [x] 2.5 Auditoria de toda escrita em `auditoria_admin`, nomeando o autor.
- [x] 2.6 Semente: os sete temas com palavras-gatilho, e duas técnicas de EXEMPLO por
      tema, `fonte = "exemplo — substituir"`, sempre em `rascunho`.
- [x] 2.7 Testes: rascunho fora de `publicadasPorTema`, publicar grava quem e quando,
      CRUD de tema e técnica, tema inexistente recusado, fonte vazia recusada.

## 3. Classificação e integração

- [x] 3.1 `src/conhecimento/classificarTema.js`: puro, `normalizar()` de `src/text.js`,
      casamento por substring, desempate por número de expressões e depois pela ordem.
- [x] 3.2 Integração em `conversaLivre` (`src/conversa/nucleo.js`), antes do
      `Promise.all`, com injeção por dependência e falha tolerada.
- [x] 3.3 Trecho de contexto em `src/llm/prompts.js`, e adendo à Regra 3 no núcleo fixo.
- [x] 3.4 Registro `tecnica_sugerida` no histórico quando houver injeção.
- [x] 3.5 Testes: tema bate e a técnica entra no prompt; nenhum tema, nada muda; só
      rascunho, nada entra; nunca mais de uma técnica no contexto; anamnese não recebe
      técnica; bloqueio de medicação continua valendo com técnica injetada.
- [x] 3.6 Teste que falha se `classificarTema.js` importar banco ou LLM.

## 4. Tela de curadoria

- [x] 4.1 `src/dashboard/rotas/tecnicas.js`: lista por tema, com status visível.
- [x] 4.2 CRUD de tema com confirmação de duas etapas para editar palavras-gatilho.
- [x] 4.3 Criar técnica entra sempre como rascunho; fonte obrigatória no servidor.
- [x] 4.4 Publicar e arquivar em duas etapas; aviso não bloqueante de termo clínico.
- [x] 4.5 Escapar todo texto; link na navegação de `html.js`.
- [x] 4.6 Testes: publicar exige confirmação, termo clínico avisa sem impedir, técnica
      sem fonte não salva, arquivada some da busca ativa e continua no banco, sem
      sessão redireciona.

## 5. Fechamento

- [x] 5.1 README: seção da base de técnicas, com o limite explícito.
- [x] 5.2 `openspec validate --all --no-interactive`.
- [x] 5.3 `npm test` — resultado real no resumo.
- [x] 5.4 Subir com `docker compose up -d --build` e exercitar o caminho.
- [x] 5.5 Sincronizar os deltas e arquivar a mudança.
- [x] 5.6 `git status` conferido, commit e push.
