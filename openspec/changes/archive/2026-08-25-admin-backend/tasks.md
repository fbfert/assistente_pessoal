## 1. Migração de schema (roda ANTES dos prompts de escrita)

- [x] 1.1 Reconfirmar que o banco de produção está vazio antes de qualquer recriação —
      não confiar na verificação registrada no `design.md`, que tem data
- [x] 1.2 `usuarios`: coluna `pausado INTEGER NOT NULL DEFAULT 0`
- [x] 1.3 `historico_interacoes`: `'acao_admin'` no CHECK de `tipo`
- [x] 1.4 Tabela `estado_conexao` de linha única, com `CHECK (id = 1)`
- [x] 1.5 `PRAGMA busy_timeout` na abertura da conexão (dois escritores agora)
- [x] 1.6 Constante do marcador de redação, distinta de `SEM_INFORMACAO`
- [x] 1.7 Documentar no commit e no README o procedimento de recriação do banco vazio
- [x] 1.8 `node --test test/*.test.js` inteiro — em especial `db.test.js` e
      `handler.integration.test.js` — para garantir que o schema novo não quebrou nada

## 2. Autenticação

- [x] 2.1 `ADMIN_PASSWORD` em `config.js` e `.env.example`, sem valor, com comentário
- [x] 2.2 Processo recusa subir sem `ADMIN_PASSWORD` definida
- [x] 2.3 Decidir entre `express-session` e cookie assinado próprio, justificando em uma
      linha; sem banco de sessão externo
- [x] 2.4 Rota de login (form HTML) com comparação por `crypto.timingSafeEqual`
- [x] 2.5 Cookie `HttpOnly`, `SameSite=Strict`, `Secure` sob HTTPS
- [x] 2.6 Middleware protegendo tudo exceto login e health
- [x] 2.7 Log de tentativa falha, sem a senha tentada
- [x] 2.8 Decidir se `config.dashboard.*` vira `config.admin.*`; se sim, atualizar
      `.env.example` e `docker-compose.yml` juntos, sem deixar as duas coexistindo
- [x] 2.9 Testes: rota protegida sem sessão redireciona; senha certa cria sessão; senha
      errada não cria; cookie forjado é rejeitado

## 3. Decomposição do módulo

- [x] 3.1 Quebrar `src/dashboard/server.js` em `admin/auth.js`, `admin/rotas/*.js` e
      `admin/views/*.js` — o módulo passa de ~150 linhas para muito além de 1000 se
      ficar num arquivo só
- [x] 3.2 Manter `renderizar` e `resumoPiloto` funcionando, com os testes existentes
      passando sem alteração de comportamento

## 4. Leitura: listas por status e página de detalhe

- [x] 4.1 Consultas de esteira: pendentes de consentimento, consentidos em andamento,
      concluídos — nominais, não só contagem
- [x] 4.2 Listagem principal com as três listas e link por linha para o detalhe
- [x] 4.3 `/usuarios/:id`: campos da anamnese, personalidade, consentimento com
      timestamp e versão
- [x] 4.4 Detalhe: remédios (`listarRemedios`) e gatilhos (`listarGatilhosUsuario`) com
      horário e situação
- [x] 4.5 Detalhe: histórico completo (`listarInteracoes`) em ordem cronológica
- [x] 4.6 Reaproveitar as funções de `userRepo.js` e `interactionLog.js` — sem duplicar
      consulta
- [x] 4.7 Escapar todo texto vindo do participante, como o `renderizar` atual já faz
- [x] 4.8 Testes de renderização das três listas e do detalhe

## 5. Escrita

- [x] 5.1 Convidar piloto novo — formulário em área própria, oferecido só para número
      inexistente ou em estado 0 sem consentimento
- [x] 5.2 `reiniciarAnamnese()` em `userRepo.js`: limpa campos, remédios e gatilhos, e
      zera o estado — não reaproveita `convidarPiloto`
- [x] 5.3 Editar campo de anamnese via `salvarCampoAnamnese`, sem reimplementar a
      validação da whitelist
- [x] 5.4 Editar e remover remédio; campo vazio grava `SEM_INFORMACAO` importado de
      `src/constants.js`
- [x] 5.5 `atualizarGatilho()` em `userRepo.js`, no padrão das funções vizinhas
- [x] 5.6 Ativar/desativar gatilho e alterar horário
- [x] 5.7 Zerar contador de silêncio via `zerarSilencio`
- [x] 5.8 Pausar/despausar; `listarGatilhosAtivos` ganha o filtro de `pausado`
- [x] 5.9 `anonimizarParticipante()`: redige número, campos de anamnese, remédios e o
      `texto` de todas as interações; preserva tipo, timestamp e gatilho relacionado;
      marca como pausado
- [x] 5.10 Telas intermediárias de confirmação em GET para reiniciar, anonimizar e
      remover remédio
- [x] 5.11 Testes de cada ação de escrita, incluindo o recorte de quem pode ser
      convidado e a preservação da auditoria na anonimização

## 6. Estado de conexão e QR

- [x] 6.1 `src/db/estadoConexaoRepo.js` com leitura e upsert de linha única
- [x] 6.2 `connection.js` grava as três transições no handler existente, sem alterar a
      lógica de reconexão
- [x] 6.3 Dependência nova `qrcode` para gerar data URI PNG (o `qrcode-terminal` só faz
      ASCII)
- [x] 6.4 Página `/conexao`: estado, idade da última atualização, QR como `<img>`
- [x] 6.5 QR mais velho que a validade esperada é sinalizado como expirado, não exibido
- [x] 6.6 Auto-refresh sem JavaScript enquanto desconectado; justificar o mecanismo em
      uma linha
- [x] 6.7 Testes: gravação das três transições a partir de `connection.update` simulado
      (mock de `sock.ev`, sem abrir WhatsApp) e renderização nos três estados

## 7. Auditoria

- [x] 7.1 Toda rota de escrita registra uma linha `acao_admin` via `registrar()`
- [x] 7.2 Texto legível identificando alvo e, quando aplicável, valor anterior e novo
- [x] 7.3 Teste confirmando exatamente uma linha de auditoria por ação, com o tipo certo
- [x] 7.4 Teste confirmando que leitura não gera linha de auditoria

## 8. Documentação e fechamento

- [x] 8.1 README: seção do backend admin — acesso, as duas camadas de proteção, o que dá
      para fazer, e o procedimento de recriação do banco
- [x] 8.2 `.env.example` com `ADMIN_PASSWORD` e eventuais variáveis renomeadas
- [x] 8.3 `openspec validate --all --no-interactive` limpo
- [x] 8.4 `node --test test/*.test.js` inteiro, com o resultado real reportado
- [x] 8.5 Sync das delta specs e arquivamento da change
- [x] 8.6 `git status` conferido antes de qualquer `git add`
- [x] 8.7 Commit local; push fica com o dono do projeto
