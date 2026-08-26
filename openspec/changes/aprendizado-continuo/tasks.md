## 1. Schema e migração

- [ ] 1.1 `schema.sql`: tabela `notas_aprendidas` (participante, campo, texto,
      `interacao_id`, `criado_em`, `removido_em`, `removido_por`), com CHECK fechado
      em `campo`, cascata a partir de `usuarios` e sem cascata em `admin_usuarios`
- [ ] 1.2 `schema.sql`: índice composto em `usuario_id` mais `campo`
- [ ] 1.3 `schema.sql`: acrescentar `aprendizado_perfil` ao CHECK de
      `historico_interacoes` — para banco novo
- [ ] 1.4 `src/db/migracoes.js`: migração do CHECK para banco existente, chamada por
      `abrirDb` logo após o `schema.sql`
- [ ] 1.5 A migração conta as linhas ANTES, recria dentro de transação com
      `PRAGMA foreign_keys = OFF` (aplicado **fora** da transação), copia, dropa,
      renomeia, recria o índice, conta DEPOIS e aborta se divergir
- [ ] 1.6 Idempotência por inspeção de `sqlite_master`: constraint já contendo o tipo
      não roda de novo
- [ ] 1.7 Antes de rodar no servidor: conferir se o WhatsApp já está pareado e contar
      as linhas de `historico_interacoes` na hora (AGENTS.md §6)

## 2. Constantes e repositório

- [ ] 2.1 `src/constants.js`: `TIPOS_INTERACAO.APRENDIZADO_PERFIL = 'aprendizado_perfil'`
- [ ] 2.2 `CAMPOS_APRENDIVEIS` **derivado** de `CAMPOS_ANAMNESE` menos `nome`,
      congelado e exportado de um lugar só — sem redigitar a lista
- [ ] 2.3 `src/db/notasRepo.js`: `criarNota`, `listarNotasAtivas(usuarioId)`,
      `listarNotasPorCampo(usuarioId)`, `buscarNota`, `removerNota(notaId, adminId)`
- [ ] 2.4 `criarNota` valida o campo contra `CAMPOS_APRENDIVEIS` antes do banco — o
      CHECK é a última linha de defesa, não a primeira
- [ ] 2.5 `removerNota` é UPDATE de `removido_em` e `removido_por`, nunca DELETE
- [ ] 2.6 `userRepo.reiniciarAnamnese`: apaga as notas do participante, dentro da
      transação que já existe
- [ ] 2.7 `userRepo.anonimizarParticipante`: redige `notas_aprendidas.texto` de todas
      as notas do participante, removidas ou não

## 3. Extração

- [ ] 3.1 `src/llm/prompts.js`: `promptExtracaoAprendizado(mensagem, perfilConhecido)`
      — instrução estrita, JSON de resposta declarado, lista de campos elegíveis
- [ ] 3.2 O prompt exige as três condições juntas: fala sobre si, descreve padrão
      recorrente, e é novo frente ao perfil conhecido — na dúvida, não captura
- [ ] 3.3 O prompt proíbe literalmente nome, dose e horário de remédio, em qualquer
      campo
- [ ] 3.4 `src/anamnese/aprenderPerfil.js`: `extrairAprendizado(mensagem,
      perfilConhecido, deps)` com `chamar` injetável, no padrão de `extrairRemedios`
- [ ] 3.5 `parsearAprendizado(bruto)` exportado à parte, puro, para teste sem rede:
      tolera cerca de código, devolve `{ aprendeu: false }` para qualquer entrada
      inesperada
- [ ] 3.6 Campo devolvido fora de `CAMPOS_APRENDIVEIS` (inclusive `nome`) vira
      "não aprendeu nada"
- [ ] 3.7 Texto vazio, só espaço, ou igual a alguma nota ativa vira "não aprendeu nada"

## 4. Integração no handler

- [ ] 4.1 `processarMensagemNormal` monta o perfil conhecido (anamnese + notas ativas)
      uma vez e passa para as duas chamadas
- [ ] 4.2 As duas chamadas disparam juntas; o envio da resposta **não** aguarda a
      extração
- [ ] 4.3 A promessa da extração nunca rejeita para fora: `catch` próprio, gravação da
      nota e da auditoria quando terminar
- [ ] 4.4 O objeto de retorno do handler continua o mesmo de hoje
- [ ] 4.5 `montarContextoAnamnese(usuario, remedios, notas = [])` e
      `montarSystemPrompt(usuario, remedios, notas = [])` — terceiro parâmetro
      aditivo, função segue pura
- [ ] 4.6 As notas entram agrupadas por campo, com rótulo distinto e a data de cada uma
- [ ] 4.7 Auditoria da criação: `historico_interacoes` com tipo `aprendizado_perfil`,
      registrando campo e texto da nota — nunca a mensagem de origem inteira

## 5. Admin

- [ ] 5.1 `src/dashboard/rotas/usuario.js`: seção "Aprendizado contínuo", agrupada por
      campo, com data, reaproveitando `ROTULOS_CAMPO`
- [ ] 5.2 Texto da nota escapado antes do HTML
- [ ] 5.3 Participante sem nota: a seção informa a ausência em vez de sumir
- [ ] 5.4 `src/dashboard/rotas/acoes.js`: GET de confirmação e POST de remoção, pelo
      helper `confirmacao()` que já existe
- [ ] 5.5 Auditoria da remoção: `acao_admin` pelo `auditar()` que já nomeia o autor,
      com campo e texto da nota

## 6. Testes

- [ ] 6.1 Mensagem com padrão recorrente gera nota (LLM mockado)
- [ ] 6.2 Mensagem com queixa pontual não gera nota (LLM mockado)
- [ ] 6.3 Mensagem sobre remédio não gera nota por este caminho
- [ ] 6.4 Falha do LLM de extração não impede o envio da resposta normal
- [ ] 6.5 Resposta malformada do LLM vira "não aprendeu nada", sem lançar
- [ ] 6.6 Campo fora da whitelist (inclusive `nome`) é recusado
- [ ] 6.7 Participante em anamnese não dispara extração
- [ ] 6.8 Nota removida some do system prompt e continua no banco
- [ ] 6.9 Nota aparece na página do participante, e o texto vai escapado
- [ ] 6.10 Migração: banco com linhas gravadas mantém a contagem, ganha o tipo novo e
      preserva o índice
- [ ] 6.11 Migração roda duas vezes sem efeito na segunda
- [ ] 6.12 Anonimização redige o texto das notas, inclusive das já removidas
- [ ] 6.13 Reinício de anamnese apaga as notas e não toca no histórico

## 7. Fechamento

- [ ] 7.1 README: o que é elegível, o que nunca é tocado, como remover pelo admin, e o
      custo dimensionado para 5 pessoas em 2 a 3 semanas
- [ ] 7.2 `openspec validate --all --no-interactive`
- [ ] 7.3 `node --test test/*.test.js` — suíte inteira, resultado real no resumo
- [ ] 7.4 `docker compose up -d --build` e exercitar o caminho de verdade: uma mensagem
      de chat livre e a página do participante
- [ ] 7.5 `git status` conferido, sync, archive e commit local
