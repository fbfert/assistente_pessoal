## Why

Pessoas neurodivergentes (TDAH/autismo) falham em rotinas de saúde não por falta de
informação, mas por falta de um empurrão no momento certo, com o tom certo. Aplicativos de
lembrete existentes cobram, acumulam notificações não lidas e punem o silêncio — exatamente o
oposto do que funciona para quem já está em sobrecarga.

O TARS piloto testa uma hipótese específica: **um assistente por WhatsApp, com personalidade
ajustável e tolerância explícita ao silêncio, sustenta engajamento onde app de lembrete não
sustenta.** WhatsApp porque é onde a pessoa já está — zero fricção de instalação, zero senha
nova, zero app a mais para esquecer.

O piloto roda com **5 pessoas** antes de virar produto. Nessa escala, várias decisões que
seriam erradas em produção são corretas aqui, e estão registradas como tais no `design.md`.

Existe um risco de segurança que molda o produto inteiro: pesquisa de autorrelato de adesão a
medicação (Stone et al. 2002, BMJ) mostra ~90% de adesão relatada contra ~11% de adesão
realmente medida. Um assistente que **inventa ou estima** dado de saúde reforça essa distância
produzindo informação que parece confiável e não é. Daí a Regra 1b do núcleo fixo.

## What Changes

Construção do piloto do zero — não há código anterior. As capacidades abaixo são todas novas.

- **Onboarding conversacional** (anamnese de 13 estados) iniciado **proativamente** pelo bot,
  abrindo com consentimento formal registrado com timestamp.
- **Persona configurável** — 3 presets sobre um núcleo fixo de 8 regras de sistema que nenhuma
  variante pode relaxar.
- **Três gatilhos agendados** (check-in matinal, remédio, checklist de fim de dia) com uma
  regra de silêncio que **reduz** a exigência de quem para de responder, em vez de aumentá-la.
- **Classificação heurística** de mensagem recebida (resposta a gatilho × despejo espontâneo),
  sem chamada de LLM.
- **Persistência SQLite** estruturada, com log append-only de interações.
- **Canal WhatsApp** via biblioteca não-oficial, com transcrição de áudio.
- **Dashboard local** de acompanhamento do piloto, acessível só por túnel SSH.
- **Empacotamento Docker** para self-host.

## Capabilities

### New Capabilities

- `anamnese`: onboarding conversacional de 13 estados (0–12), consentimento LGPD, tolerância a
  resposta vaga e captura do vocabulário próprio do usuário.
- `persona`: núcleo fixo de 8 regras de sistema mais 3 variantes de personalidade, e a
  montagem do system prompt final a partir da anamnese.
- `llm-provider`: roteamento de chamadas de LLM entre Claude, OpenAI e DeepSeek, trocável por
  variável de ambiente sem alteração de código.
- `armazenamento`: esquema SQLite, repositórios de acesso e log append-only de interações.
- `gatilhos`: agendamento e disparo dos três gatilhos do MVP, e a regra de silêncio.
- `classificacao-mensagem`: heurística de janela temporal que separa resposta a gatilho de
  despejo espontâneo.
- `canal-whatsapp`: conexão, roteamento de mensagem recebida, transcrição de áudio e convite
  proativo de piloto.
- `dashboard-piloto`: agregações de acompanhamento e sua exposição em HTML local.
- `operacao-docker`: empacotamento, volumes, exposição de porta e procedimento de pareamento.

### Modified Capabilities

Nenhuma. Projeto greenfield — não há spec anterior em `openspec/specs/`.

## Impact

- **Código:** repositório inteiro (`src/`, `test/`, `scripts/`) — hoje vazio.
- **Dependências novas:** `@whiskeysockets/baileys`, `better-sqlite3` (compila binário nativo),
  `dotenv`, `express`, `node-cron`, `pino`, `qrcode-terminal`.
- **Serviços externos:** APIs de Anthropic / OpenAI / DeepSeek (LLM) e OpenAI
  (`gpt-4o-transcribe`). Exigem chave; não são exercitadas por teste automatizado.
- **Infraestrutura:** Docker + Docker Compose no servidor. Volume nomeado `tars_data` guarda o
  SQLite e as credenciais de sessão do WhatsApp.
- **Hardware:** chip físico dedicado para o número do WhatsApp — número virtual/VoIP é
  rejeitado no registro. Número **separado** do já usado em produção na Xiax.
- **Dado sensível:** o banco guarda dado de saúde (nome de remédio, horário) e o registro de
  consentimento. LGPD se aplica.
