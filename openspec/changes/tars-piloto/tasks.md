## 1. Estrutura do projeto e configuração

- [x] 1.1 `package.json` com `"type": "module"`, dependências (`@whiskeysockets/baileys`,
      `better-sqlite3`, `dotenv`, `express`, `node-cron`, `pino`, `qrcode-terminal`) e scripts
      `start`, `dashboard`, `test`
- [x] 1.2 `.gitignore` cobrindo `node_modules/`, `.env`, `data/`, `*.sqlite*`, `auth/` e os
      diretórios da hospedagem (`Maildir/`, `public_html/`, `logs/`, `etc/`, `cgi-bin/`,
      `virtualmin-backup/`, `md/`)
- [x] 1.3 `.env.example` documentando todas as variáveis: chaves dos 3 provedores,
      `LLM_PROVIDER`, `TZ`, `DB_PATH`, `WHATSAPP_AUTH_DIR`, `DASHBOARD_PORT`,
      `RESPOSTA_GATILHO_JANELA_MIN=120`, `SILENCIOS_ATE_REDUZIR_TOM=3`
- [x] 1.4 `src/config.js` lendo o ambiente com defaults sensatos e exportando um objeto único
- [x] 1.5 `npm install` concluído sem erro, com `better-sqlite3` compilando o binário nativo

## 2. Camada de dados

- [x] 2.1 `src/db/schema.sql` com as 6 tabelas, os CHECKs de domínio e o índice composto de
      `historico_interacoes`
- [x] 2.2 `src/db/db.js` — `getDb()` singleton com WAL e `foreign_keys=on`, schema na primeira
      abertura, `closeDb()`
- [x] 2.3 Constante `SEM_INFORMACAO = 'sem informação'` exportada de um módulo único, usada por
      todo o resto (Regra 1b)
- [x] 2.4 `src/db/userRepo.js` — acesso a usuário, remédio, gatilho e contador
- [x] 2.5 `ativarGatilhosPadrao(usuario_id)` — `checkin_manha` 08:00, um `remedio` por remédio
      com nome e horário válidos, `checklist_fim_dia` 20:00 com `ativo=0`
- [x] 2.6 `incrementarDespejoEspontaneo` com reset na virada de semana
- [x] 2.7 `src/db/interactionLog.js` — `registrar`, `ultimoGatilhoDisparado`,
      `houveRespostaOuSilencioApos` e as agregações do dashboard
- [x] 2.8 `test/db.test.js` contra SQLite temporário real: idempotência de `findOrCreate`,
      transição no consentimento, fallback `sem informação` do remédio, contador de silêncio,
      log de histórico, contador semanal de despejo
- [x] 2.9 Testes do grupo 2 passando

## 3. Máquina de estados da anamnese

- [x] 3.1 `src/anamnese/questions.js` — `ESTADOS` congelado, `PERGUNTAS`,
      `TEXTO_CONSENTIMENTO`, `VERSAO_CONSENTIMENTO = 'v1'`
- [x] 3.2 `isVago`, `isAfirmativo`, `isNegativo`, `isPular` por normalização + igualdade exata
      contra `Set` fechado — nunca prefixo, nunca regex solto
- [x] 3.3 `processarResposta(usuario, texto, deps)` cobrindo a transição 0→12, com `deps`
      injetando extração de remédio e LLM
- [x] 3.4 Retry único de resposta vaga; estado pulável; fallback de personalidade para `neutro`
      na segunda tentativa; estado 11 apenas registrando `correcao_reportada`
- [x] 3.5 `montarResumoAnamnese(usuario, remedios)`
- [x] 3.6 `src/anamnese/extrairRemedios.js` — prompt reforçando a Regra 1b, JSON estrito, parse
      defensivo retornando `[]` em falha
- [x] 3.7 `test/stateMachine.test.js` incluindo o caso `"pode me chamar de Ana"` contra
      `isAfirmativo`
- [x] 3.8 Testes do grupo 3 passando

## 4. LLM multi-provider e prompts de persona

- [x] 4.1 `src/llm/router.js` — `chamarLLM({systemPrompt, mensagens, provider})`, Anthropic
      Messages API para Claude, implementação compartilhada estilo OpenAI para OpenAI/DeepSeek,
      `PROVIDERS_DISPONIVEIS`
- [x] 4.2 `src/llm/prompts.js` — `NUCLEO_FIXO` com as 8 regras, as 3 variantes, `PERSONALIDADES`
- [x] 4.3 `montarSystemPrompt`, `montarContextoAnamnese`, `perguntaEscolhaPersonalidade`,
      `mapearRespostaPersonalidade`
- [x] 4.4 Ligar `extrairRemedios` ao `chamarLLM` real
- [x] 4.5 Teste unitário de montagem de prompt e parsing, sem rede e sem chave

## 5. Classificação de mensagem

- [x] 5.1 `src/classify/heuristic.js` — `classificarMensagem(agora, ultimoGatilho, janelaMinutos)`
      pura, com a simplificação de 1ª/2ª mensagem documentada em comentário
- [x] 5.2 `test/heuristic.test.js` — sem gatilho anterior, dentro, fora e exatamente no limite
- [x] 5.3 Testes do grupo 5 passando

## 6. Transcrição de áudio

- [x] 6.1 `src/transcription/transcribe.js` — `transcreverAudio(audioBuffer, mimeType)` via
      multipart, modelo de `config.transcription.model`, `language: 'pt'`, erro tratado sem
      derrubar a conversa

## 7. Gatilhos: mensagens e scheduler

- [x] 7.1 `src/triggers/messages.js` — `mensagemCheckinManha(reduzido)` com enquadramento
      binário, `mensagemRemedio(nomeRemedio)`, `mensagemChecklistFimDia(reduzido)` e o
      dispatcher `montarMensagemGatilho`
- [x] 7.2 `src/triggers/scheduler.js` — tick de minuto: hora de São Paulo via
      `Intl.DateTimeFormat`, gatilhos ativos, tom reduzido por contador, envio e registro de
      `gatilho_disparado`, sem repetir o mesmo tipo no mesmo dia
- [x] 7.3 Tick de 5 minutos: silêncio registrado e contador incrementado; resposta zera o
      contador

## 8. WhatsApp: conexão, handler e convite proativo

- [x] 8.1 `src/whatsapp/connection.js` — Baileys, `useMultiFileAuthState`, QR no terminal,
      reconexão automática exceto em logout, filtro de grupo e de mensagem própria
- [x] 8.2 `src/whatsapp/handler.js` — transcrição de áudio primeiro, roteamento por
      `anamnese_estado`, classificação, system prompt, resposta via LLM e registro da interação
- [x] 8.3 `src/admin/convidarPiloto.js` — caminho principal de onboarding: cria ou reaproveita
      usuário, estado 0, envia consentimento proativamente
- [x] 8.4 `scripts/convidar-piloto.js` — CLI que conecta, espera conexão aberta com timeout de
      60s, convida e sai
- [x] 8.5 `src/index.js` — `getDb()`, `conectarWhatsapp()`, `iniciarScheduler(enviarMensagem)`
- [x] 8.6 `test/handler.integration.test.js` — ponta a ponta começando por `convidarPiloto()`,
      anamnese completa via `tratarMensagemRecebida` real contra SQLite real, verificando
      estado 12, `checkin_manha` ativo às 08:00 e contagem de mensagens
- [x] 8.7 Testes do grupo 8 passando

## 9. Dashboard

- [x] 9.1 `src/dashboard/queries.js` — `resumoPiloto()` com despejos da semana, silêncios por
      tipo, `alertaSobrecarga`, correções reportadas e funil de check-in
- [x] 9.2 `src/dashboard/server.js` — Express, tabela HTML sem biblioteca de gráfico, linha em
      alerta destacada

## 10. Docker

- [x] 10.1 `Dockerfile` — `node:22-bookworm-slim`, `python3 make g++ ca-certificates`,
      `npm ci --omit=dev`, `DB_PATH=/data/tars.sqlite`, `WHATSAPP_AUTH_DIR=/data/auth`,
      `VOLUME ["/data"]`
- [x] 10.2 `docker-compose.yml` — serviços `tars` e `dashboard` sobre volume nomeado
      `tars_data`, `stdin_open`/`tty` no bot, dashboard publicado em `127.0.0.1:3300`
- [x] 10.3 `docker compose build` concluído sem erro

## 11. README e checagem final

- [x] 11.1 `README.md` — pré-requisitos, clone e remote, `.env`, subida, pareamento por QR
      (número separado, chip físico não-VoIP), convite dos 5 pilotos, túnel SSH para o
      dashboard, como rodar os testes, e a seção do que ficou simplificado de propósito
- [x] 11.2 `node --test test/*.test.js` inteiro, com o resultado real reportado
- [x] 11.3 `openspec validate --all --no-interactive` passando
- [x] 11.4 `git init`, `git status` conferido contra os diretórios da hospedagem, e um commit
      único descrevendo o que foi construído
- [x] 11.5 Relatório final: total de testes, TODOs remanescentes e o que só se confirma com
      chave de API ou número real
