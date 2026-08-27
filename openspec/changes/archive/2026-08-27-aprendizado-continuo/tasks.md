## 1. Schema e migração

- [x] 1.1 `schema.sql`: tabela `notas_aprendidas` (participante, campo, texto,
      `interacao_id`, `criado_em`, `removido_em`, `removido_por`), com CHECK fechado
      em `campo`, cascata a partir de `usuarios` e sem cascata em `admin_usuarios`
- [x] 1.2 `schema.sql`: índice composto em `usuario_id` mais `campo`
- [x] 1.3 `schema.sql`: acrescentar `aprendizado_perfil` ao CHECK de
      `historico_interacoes` — para banco novo
- [x] 1.4 `src/db/migracoes.js`: migração do CHECK para banco existente, chamada por
      `abrirDb` logo após o `schema.sql`
- [x] 1.5 A migração conta as linhas ANTES, recria dentro de transação com
      `PRAGMA foreign_keys = OFF` (aplicado **fora** da transação), copia, dropa,
      renomeia, recria o índice, conta DEPOIS e aborta se divergir
- [x] 1.6 Idempotência por inspeção de `sqlite_master`: constraint já contendo o tipo
      não roda de novo
- [x] 1.7 Antes de rodar no servidor: conferir se o WhatsApp já está pareado e contar
      as linhas de `historico_interacoes` na hora (AGENTS.md §6) — conferido na hora:
      WhatsApp NÃO pareado, 61 linhas de histórico, 2 participantes, notas_aprendidas
      ainda inexistente e CHECK sem aprendizado_perfil

## 2. Constantes e repositório

- [x] 2.1 `src/constants.js`: `TIPOS_INTERACAO.APRENDIZADO_PERFIL = 'aprendizado_perfil'`
- [x] 2.2 `CAMPOS_APRENDIVEIS` **derivado** de `CAMPOS_ANAMNESE` menos `nome`,
      congelado e exportado de um lugar só — sem redigitar a lista
- [x] 2.3 `src/db/notasRepo.js`: `criarNota`, `listarNotasAtivas(usuarioId)`,
      `listarNotasPorCampo(usuarioId)`, `buscarNota`, `removerNota(notaId, adminId)`
- [x] 2.4 `criarNota` valida o campo contra `CAMPOS_APRENDIVEIS` antes do banco — o
      CHECK é a última linha de defesa, não a primeira
- [x] 2.5 `removerNota` é UPDATE de `removido_em` e `removido_por`, nunca DELETE
- [x] 2.6 `userRepo.reiniciarAnamnese`: apaga as notas do participante, dentro da
      transação que já existe
- [x] 2.7 `userRepo.anonimizarParticipante`: redige `notas_aprendidas.texto` de todas
      as notas do participante, removidas ou não

## 3. Extração

- [x] 3.1 `src/llm/prompts.js`: `promptExtracaoAprendizado(mensagem, perfilConhecido)`
      — instrução estrita, JSON de resposta declarado, lista de campos elegíveis
- [x] 3.2 O prompt exige as três condições juntas: fala sobre si, descreve padrão
      recorrente, e é novo frente ao perfil conhecido — na dúvida, não captura
- [x] 3.3 O prompt proíbe literalmente nome, dose e horário de remédio, em qualquer
      campo
- [x] 3.4 `src/anamnese/aprenderPerfil.js`: `extrairAprendizado(mensagem,
      perfilConhecido, deps)` com `chamar` injetável, no padrão de `extrairRemedios`
- [x] 3.5 `parsearAprendizado(bruto)` exportado à parte, puro, para teste sem rede:
      tolera cerca de código, devolve `{ aprendeu: false }` para qualquer entrada
      inesperada
- [x] 3.6 Campo devolvido fora de `CAMPOS_APRENDIVEIS` (inclusive `nome`) vira
      "não aprendeu nada"
- [x] 3.7 Texto vazio, só espaço, ou igual a alguma nota ativa vira "não aprendeu nada"

## 4. Integração no handler

- [x] 4.1 `conversaLivre` (`src/conversa/nucleo.js`) monta o perfil conhecido
      (anamnese + notas ativas) uma vez e passa para as chamadas
- [x] 4.2 A extração entra como TERCEIRA promessa do `Promise.all` que já existe
      (resposta + extração de remédio); o envio não aguarda por ela
- [x] 4.3 A promessa da extração nunca rejeita para fora: `catch` próprio, gravação da
      nota e da auditoria quando terminar
- [x] 4.4 O objeto de retorno do núcleo continua o mesmo de hoje
- [x] 4.8 Não toca em `src/conversa/seguranca.js`: este mecanismo não envia mensagem,
      então não cruza a verificação que examina a saída do modelo
- [x] 4.5 `montarContextoAnamnese(usuario, remedios, notas = [])` e
      `montarSystemPrompt(usuario, remedios, notas = [])` — terceiro parâmetro
      aditivo, função segue pura
- [x] 4.6 As notas entram agrupadas por campo, com rótulo distinto e a data de cada uma
- [x] 4.7 Auditoria da criação: `historico_interacoes` com tipo `aprendizado_perfil`,
      registrando campo e texto da nota — nunca a mensagem de origem inteira

## 5. Admin

- [x] 5.1 `src/dashboard/rotas/usuario.js`: seção "Aprendizado contínuo", agrupada por
      campo, com data, reaproveitando `ROTULOS_CAMPO`
- [x] 5.2 Texto da nota escapado antes do HTML
- [x] 5.3 Participante sem nota: a seção informa a ausência em vez de sumir
- [x] 5.4 `src/dashboard/rotas/acoes.js`: GET de confirmação e POST de remoção, pelo
      helper `confirmacao()` que já existe
- [x] 5.5 Auditoria da remoção: `acao_admin` pelo `auditar()` que já nomeia o autor,
      com campo e texto da nota

## 6. Testes

- [x] 6.1 Mensagem com padrão recorrente gera nota (LLM mockado)
- [x] 6.2 Mensagem com queixa pontual não gera nota (LLM mockado)
- [x] 6.3 Mensagem sobre remédio não gera nota por este caminho
- [x] 6.4 Falha do LLM de extração não impede o envio da resposta normal
- [x] 6.5 Resposta malformada do LLM vira "não aprendeu nada", sem lançar
- [x] 6.6 Campo fora da whitelist (inclusive `nome`) é recusado
- [x] 6.7 Participante em anamnese não dispara extração
- [x] 6.8 Nota removida some do system prompt e continua no banco
- [x] 6.9 Nota aparece na página do participante, e o texto vai escapado
- [x] 6.10 Migração: banco com linhas gravadas mantém a contagem, ganha o tipo novo e
      preserva o índice
- [x] 6.11 Migração roda duas vezes sem efeito na segunda
- [x] 6.12 Anonimização redige o texto das notas, inclusive das já removidas
- [x] 6.13 Reinício de anamnese apaga as notas e não toca no histórico

## 7. Fechamento

- [x] 7.1 README: o que é elegível, o que nunca é tocado, como remover pelo admin, e o
      custo dimensionado para 5 pessoas em 2 a 3 semanas
- [x] 7.2 `openspec validate --all --no-interactive`
- [x] 7.3 `node --test test/*.test.js` — suíte inteira, resultado real no resumo
- [x] 7.4 `docker compose up -d --build` e exercitar o caminho de verdade — em
      container descartável com LLM real, porque fazê-lo em produção criaria nota no
      perfil de uma pessoa real: padrão recorrente virou nota, queixa pontual não,
      nome não; contexto, auditoria e soft delete conferidos
- [x] 7.5 `git status` conferido, sync, archive e commit local
