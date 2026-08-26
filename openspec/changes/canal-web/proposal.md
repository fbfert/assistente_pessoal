## Why

O piloto depende de um canal só, e esse canal é o mais frágil da pilha:
`@whiskeysockets/baileys` é biblioteca **não-oficial**. A sessão cai, o número pode
ser bloqueado pelo WhatsApp, e reparear exige o chip em mãos, presencialmente. Hoje,
qualquer uma dessas coisas para o piloto inteiro — e no momento em que isto é escrito
o pareamento sequer aconteceu.

Há também gente que o WhatsApp não alcança bem: quem trabalha em máquina onde o
WhatsApp Web é bloqueado, quem separa a vida pessoal do aparelho de trabalho, quem
simplesmente não quer um assistente de saúde no mesmo lugar em que a família manda
mensagem.

E há uma razão de produto: validar a conversa **sem depender de aprovação de
plataforma**. Se o piloto mostrar que o formato funciona, ter um canal próprio já
pronto é a diferença entre iterar e esperar.

O que **não** justifica esta mudança: substituir o WhatsApp. Ele continua sendo o
canal principal, e o único que alcança a pessoa sem que ela peça — que é o mecanismo
central do produto.

## What Changes

- **Um núcleo de conversa canal-agnóstico**, extraído de `src/whatsapp/handler.js`:
  recebe usuário identificado, texto e uma função de envio, e não sabe quem o chamou.
  Baileys e a web viram **dois adaptadores finos** sobre o mesmo núcleo — mesma
  anamnese, mesma classificação, mesma persona, mesmo LLM.
- **O canal web roda dentro do processo do bot** (`tars`), não do dashboard: acesso
  direto ao banco e ao router de LLM, sem API entre containers.
- **Entrada por telefone + data de nascimento**, validada contra quem o admin já
  pré-cadastrou. A rota **nunca cria participante** — sem convite, não há entrada.
- **Sessão web curta**, em tabela própria, com o token guardado como hash.
- **Página pública de chat**: tela de entrada e a conversa, em HTML com JavaScript
  mínimo (`fetch`), sem framework e sem build.
- **`data_nascimento` em `usuarios`** e **`canal` em `historico_interacoes`**: passa a
  ser possível responder "por onde essa pessoa falou?".
- **O convite do admin passa a pedir a data de nascimento**, virando o ponto único de
  pré-cadastro, independentemente do canal que a pessoa vá usar.

## Capabilities

### New Capabilities

- `nucleo-conversa`: o processamento de mensagem que os dois canais compartilham —
  o que é do canal, o que é do núcleo, e o que nenhum adaptador pode reimplementar.
- `canal-web`: entrada, sessão, envio de mensagem e a página pública do chat.

### Modified Capabilities

- `armazenamento`: `data_nascimento`, `canal` no histórico, tabela `sessoes_web`, e a
  anonimização passando a cobrir as duas coisas novas.
- `canal-whatsapp`: o Baileys passa a ser adaptador do núcleo, sem mudar o que a
  pessoa vê.
- `anamnese`: as perguntas e o consentimento passam a ser explicitamente
  independentes de transporte.
- `admin-operacao`: o convite recebe a data de nascimento.
- `dashboard-piloto`: a página do participante mostra a data de nascimento e por qual
  canal cada interação chegou.

## Impact

- **Código:** `src/conversa/nucleo.js` (novo), `src/whatsapp/handler.js` (vira
  adaptador), `src/web/` (novo: servidor, rotas, página), `src/index.js`,
  `src/db/schema.sql`, `src/db/migracoes.js`, `src/db/userRepo.js`,
  `src/db/interactionLog.js`, `src/db/sessaoWebRepo.js` (novo),
  `src/admin/convidarPiloto.js`, `src/dashboard/rotas/{painel,acoes,usuario}.js`,
  `test/`.
- **Dependências:** nenhuma. Express já está no projeto; o cliente é `fetch` do
  navegador.
- **Schema:** duas colunas novas e uma tabela nova. As colunas **não** entram sozinhas
  num banco existente — `CREATE TABLE IF NOT EXISTS` não altera tabela que já existe.
  Exige script de migração (`ALTER TABLE ... ADD COLUMN`, que o SQLite suporta), não
  recriação de volume.
- **Superfície de rede:** é a **primeira porta do projeto aberta ao público**. O admin
  nunca foi alcançável direto; este canal é, por definição. Ver os riscos no design.
- **Fora de escopo, explicitamente:** **notificação push (Web Push)**. O canal web é
  **só reativo**: responde quando a pessoa escreve e nunca inicia conversa. Check-in
  da manhã, lembrete de remédio, checklist de fim de dia e gatilho de silêncio
  continuam **exclusivos do WhatsApp**. Também fora: recuperação de acesso por e-mail,
  anexo e áudio pela web, e múltiplos idiomas.
