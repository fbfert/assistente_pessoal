## 1. Núcleo de conversa

- [x] 1.1 `src/conversa/nucleo.js`: `processarMensagem({ usuario, texto, canal, responder }, deps)`
- [x] 1.2 Move para lá `processarPassoAnamnese` e `processarMensagemNormal`, sem
      alterar o que elas decidem
- [x] 1.3 `responder(texto)` substitui `enviarMensagem(numero, texto)` — o núcleo deixa
      de conhecer número de telefone
- [x] 1.4 Todo `registrar()` do núcleo passa o canal
- [x] 1.5 As dependências injetadas continuam as mesmas (`chamar`, `extrair`, `db`)
- [x] 1.6 O núcleo não importa nada de `src/whatsapp/` nem de `src/web/` — teste que
      falha se importar

## 2. Adaptador do WhatsApp

- [x] 2.1 `src/whatsapp/handler.js` fica só com: filtro de origem, transcrição de
      áudio, `findByWhatsapp`, rede de segurança do desconhecido e a chamada ao núcleo
- [x] 2.2 `tratarMensagemRecebida` mantém a assinatura atual — `src/index.js` e os
      testes existentes não mudam por causa disto
- [x] 2.3 O retorno continua o mesmo objeto de hoje
- [x] 2.4 Scheduler continua chamando `enviarMensagem` direto, e registra canal
      `whatsapp` no disparo

## 3. Schema e migração

- [x] 3.1 `schema.sql`: `data_nascimento` em `usuarios` (texto, anulável)
- [x] 3.2 `schema.sql`: `canal` em `historico_interacoes` (CHECK `whatsapp`/`web`, NOT
      NULL, default `whatsapp`)
- [x] 3.3 `schema.sql`: tabela `sessoes_web` (`token_hash`, `usuario_id` com cascata,
      `criado_em`, `expira_em`) e índice por `expira_em`
- [x] 3.4 `src/db/migracoes.js`: `ALTER TABLE ... ADD COLUMN` para as duas colunas,
      idempotente por `PRAGMA table_info`
- [ ] 3.5 Contar as linhas antes e conferir o pareamento do WhatsApp antes de rodar no
      servidor (AGENTS.md §6)
- [x] 3.6 `CANAIS` como constante congelada em `src/constants.js` — nenhum literal
      solto

## 4. Sessão web

- [ ] 4.1 `src/db/sessaoWebRepo.js`: `criar(usuarioId)`, `validar(token)`,
      `encerrar(token)`, `apagarExpiradas()`, `apagarDoUsuario(usuarioId)`
- [ ] 4.2 `criar` devolve o token em claro UMA vez; o banco guarda só o hash
- [ ] 4.3 Reaproveita o hash `scrypt` de `src/dashboard/senha.js` — sem dependência
      nova
- [ ] 4.4 `validar` recusa ausente, desconhecido e expirado, e apaga o expirado
- [ ] 4.5 `userRepo.anonimizarParticipante` apaga as sessões e redige
      `data_nascimento`

## 5. Rotas do canal web

- [ ] 5.1 `src/web/servidor.js`: Express próprio, porta própria
      (`WEB_PORT`), montado a partir de `src/index.js`
- [ ] 5.2 Falha de rota não derruba o processo: handler de erro explícito, e o
      `listen` não bloqueia a conexão do WhatsApp
- [ ] 5.3 `POST /entrar`: telefone + data de nascimento → token
- [ ] 5.4 Nunca cria participante; exige `anamnese_estado` existente e
      `data_nascimento` preenchida
- [ ] 5.5 Resposta de falha idêntica nos três casos (telefone ausente, data errada,
      sem data cadastrada)
- [ ] 5.6 Limite: 5 falhas / 15 min por origem **e** por telefone, atraso de 1s por
      falha, sucesso zera as duas contagens
- [ ] 5.7 Entrada bem-sucedida registra interação; o token nunca entra em registro nem
      em log
- [ ] 5.8 `POST /mensagem`: exige token, identifica pela sessão, chama o núcleo e
      devolve a resposta na mesma requisição
- [ ] 5.9 Campo de identificação no corpo é ignorado, não respeitado
- [ ] 5.10 Nenhuma rota lista participantes nem alcança o admin

## 6. Página pública

- [ ] 6.1 `src/web/publico/` : uma página com tela de entrada e tela de conversa
- [ ] 6.2 JavaScript só com `fetch` e desenho da resposta — sem framework, sem build,
      sem recurso externo
- [ ] 6.3 Texto inserido como texto (`textContent`), nunca como HTML
- [ ] 6.4 Nenhuma regra de negócio no cliente: a página não sabe o que é anamnese

## 7. Admin

- [ ] 7.1 `convidarPiloto` recebe e grava a data de nascimento
- [ ] 7.2 Formulário de convite ganha o campo, obrigatório; data malformada ou futura é
      recusada antes do banco
- [ ] 7.3 Página do participante: exibe e permite corrigir a data de nascimento,
      auditado
- [ ] 7.4 Histórico da página do participante mostra o canal de cada interação

## 8. Testes

- [x] 8.1 Núcleo decide igual para os dois canais, com o mesmo estado e o mesmo texto
- [x] 8.2 Núcleo não importa módulo de canal
- [x] 8.3 Anamnese iniciada num canal continua no outro, do ponto em que parou
- [x] 8.4 Comportamento do WhatsApp inalterado — a suíte existente passa sem edição
- [ ] 8.5 Entrada válida devolve token; telefone desconhecido, data errada e participante
      sem data devolvem **a mesma** resposta
- [ ] 8.6 Entrada nunca cria participante
- [ ] 8.7 Bloqueio por origem e bloqueio por telefone, cada um isoladamente
- [ ] 8.8 Sucesso zera as contagens
- [ ] 8.9 Token não é recuperável do banco; sessão expirada é recusada e removida
- [ ] 8.10 `/mensagem` sem token, com token inválido e com token expirado
- [ ] 8.11 Campo de identidade no corpo não troca o participante
- [ ] 8.12 Nenhuma resposta do canal web contém token, dado de outro participante ou
      lista de participantes
- [ ] 8.13 Gatilho não sai pela web; scheduler segue só no WhatsApp
- [x] 8.14 Migração: banco antigo ganha as colunas com os dados preservados, e roda
      duas vezes sem efeito na segunda
- [ ] 8.15 Anonimização redige `data_nascimento` e apaga as sessões
- [ ] 8.16 Texto do participante que se parece com HTML aparece como texto

## 9. Fechamento

- [ ] 9.1 README: o segundo canal, como a pessoa entra, o que ele NÃO faz (nenhuma
      notificação), e a porta nova exposta
- [ ] 9.2 `.env.example`: `WEB_PORT` e o que muda no Compose
- [ ] 9.3 `docker-compose.yml`: publicar a porta do canal web — e registrar por que
      **esta** publicação é diferente do bind em loopback do admin
- [ ] 9.4 `openspec validate --all --no-interactive` e suíte inteira
- [ ] 9.5 Verificar rodando: entrar pela página, responder uma pergunta da anamnese e
      conferir a linha no histórico com canal `web`
- [ ] 9.6 Sync (atenção aos quatro requisitos que `aprendizado-continuo` também
      modifica), archive e commit local
