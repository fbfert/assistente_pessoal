# AGENTS.md — Regras permanentes para agentes

> Fonte única de verdade sobre **como trabalhar neste repositório**.
> Vale para Claude Code, Cursor, Codex, GitHub Copilot e qualquer outro agente.
> `CLAUDE.md` apenas aponta para este arquivo — não duplique regras lá.

---

## 0. Contexto do projeto

**TARS piloto** — assistente pessoal por WhatsApp para pessoas neurodivergentes
(TDAH/autismo), rodando como piloto de validação com 5 pessoas antes de virar produto.

- **NÃO é terapeuta.** É guia diário de rotina (remédios, tarefas, sono) com persona configurável.
- Stack: Node.js 22 + ESM (`"type": "module"`), SQLite (better-sqlite3), Express,
  node-cron, `@whiskeysockets/baileys` (WhatsApp não-oficial), self-host via Docker.
- LLM multi-provider (Claude / OpenAI / DeepSeek), trocável por variável de ambiente.
- Empresa: **Xiax**.

**Dois processos, um volume.** `tars` (bot: WhatsApp + scheduler) e `dashboard`
(backend administrativo) são containers separados que compartilham **apenas** o
volume do SQLite. Não há memória, socket nem evento em comum — qualquer coisa que
um precise contar ao outro passa por uma tabela. É o que motiva `estado_conexao`
(o QR de pareamento) e a validação de cache por `MAX(atualizado_em)`.

**Regra 1b (crítica, dado de saúde):** o sistema **NUNCA** inventa ou estima dado de saúde
(nome de remédio, dose, horário). Campo sem informação = a string literal `sem informação`
(com acento e cedilha, byte a byte), nunca um chute. Existe pesquisa real (Stone et al. 2002,
BMJ) mostrando autorrelato de adesão a medicação ~90% contra adesão medida ~11% — o sistema
não pode reforçar essa distância inventando dado que parece confiável e não é.
Essa string vive como **constante exportada de um lugar só**; nunca repita o literal.

---

## 1. As specs são a fonte de verdade

1. **Antes de qualquer alteração de código, o agente DEVE ler as specs aplicáveis.**
   Comece sempre por `openspec list`, `openspec list --specs` e leia o que for relevante em
   `openspec/specs/<capability>/spec.md` e nas mudanças ativas em `openspec/changes/<nome>/`.
2. **As specs são a fonte de verdade do projeto.** Onde spec e comentário, ticket, conversa
   antiga ou memória do agente divergirem, a spec ganha.
3. **Nenhuma implementação pode contrariar uma spec aprovada.** Se a implementação exige
   contrariar a spec, o caminho é atualizar a spec primeiro — não o contrário.
4. **Conflito entre código existente e spec: aponte antes de alterar.** Descreva o conflito
   (arquivo, linha, trecho da spec) e espere decisão. Não "conserte" silenciosamente para um
   dos lados.
5. **Ambiguidade: pare e peça decisão humana.** Spec ambígua, incompleta ou contraditória não
   se resolve por chute. Registre a dúvida e pare.
6. **Toda nova funcionalidade tem spec criada ou atualizada ANTES da implementação.**
   Sem spec, sem código — inclusive sob pressão de prazo.
   *Isentos:* correção de bug, typo, documentação e formatação.
7. **Toda alteração relevante é validada com OpenSpec antes de ser considerada concluída.**
   Rode `openspec validate --all --no-interactive` (ou `--changes` / `--specs` / `<item>`)
   e trate erro de validação como bloqueio, nunca como aviso.
8. **Todo resumo final deve registrar explicitamente:**
   - quais specs foram lidas (caminho completo);
   - quais comandos de validação foram executados e o resultado de cada um.

---

## 2. Onde ficam as specs

| Caminho | O que é |
|---|---|
| `openspec/specs/<capability>/spec.md` | Specs consolidadas (requisitos + cenários). Fonte de verdade. |
| `openspec/changes/<nome>/` | Mudança em andamento: `proposal.md`, `specs/` (delta), `design.md`, `tasks.md`. |
| `openspec/changes/archive/YYYY-MM-DD-<nome>/` | Mudanças concluídas e arquivadas. |
| `openspec/config.yaml` | Schema (`spec-driven`) + idioma (pt-BR) + regras por artefato. |

Artefatos são escritos em **português (pt-BR)**. Os cabeçalhos estruturais do OpenSpec e as
palavras normativas `SHALL` / `MUST` ficam em inglês — a validação depende delas.

---

## 3. Ciclo de trabalho (OpenSpec)

```
/opsx:explore   → pensar antes de decidir (não implementa nada)
/opsx:propose   → cria openspec/changes/<nome>/ com proposal, specs, design, tasks
/opsx:apply     → implementa as tasks, marcando - [ ] → - [x]
/opsx:sync      → sincroniza delta specs para openspec/specs/
/opsx:archive   → arquiva a mudança concluída
```

Grafia por ferramenta: `/opsx:propose` (Claude Code) · `/opsx-propose` (Cursor, GitHub Copilot)
· `$openspec-propose` (Codex).

CLI equivalente: `openspec list`, `openspec show <item>`, `openspec status --change <nome> --json`,
`openspec instructions apply --change <nome> --json`, `openspec validate`, `openspec archive`.

**Não pule fases por conta própria.** O fluxo é fluido (dá para voltar e editar qualquer
artefato a qualquer momento), mas implementar sem proposta aprovada não é fluidez — é pular a spec.

---

## 4. Regras de código deste projeto

- **ESM sempre** (`import`/`export`). Nada de `require`.
- **Funções puras onde a spec pede pureza.** `src/anamnese/stateMachine.js` e
  `src/classify/heuristic.js` não importam banco: recebem estado + dependências injetadas e
  devolvem um plano de ação. Isso é proposital, para testar sem SQLite real.
- **Nomes de coluna do banco são contrato.** Outros módulos dependem deles; renomear coluna é
  mudança de spec.
- **Comparação de resposta do usuário: igualdade exata contra um `Set` fechado de frases
  canônicas.** Nunca regex de prefixo. Bug real já pago: `/^(sim|s|ok|pode)\b/` fez
  `"pode me chamar de Ana"` (resposta da pergunta de NOME) bater como afirmativo de
  CONSENTIMENTO e descolar toda a máquina de estados. Existe teste dedicado a esse caso —
  não o remova.
- **Onboarding é proativo**, não reativo: quem manda a primeira mensagem é o bot
  (`convidarPiloto`). O branch reativo do handler é só rede de segurança.
- **Segurança de rede:** o processo do admin nunca é alcançável direto da internet.
  No Compose ele escuta `0.0.0.0` *dentro do container* e quem restringe é o bind
  `127.0.0.1:3300` da publicação de porta; rodando direto no host, escuta
  `127.0.0.1`. Confira sempre pela porta observada no host (`ss -ltn | grep 3300`),
  nunca pelo que o processo loga.
  O acesso externo passa por um proxy reverso do Apache em `tdah.xiax.com.br`
  (`public_html/.htaccess`, **fora do Git**) ou por túnel SSH. Quem autentica é a
  aplicação, não o proxy.
- **Segredos nunca entram no Git.** `.env` é gitignored; `.env.example` documenta as variáveis
  sem valores.
- **Testes:** `npm test` (`node --test test/*.test.js` — o diretório sozinho não
  funciona no Node 22). Rode antes de considerar qualquer etapa concluída e reporte
  o resultado real — teste que falha se reporta como falha, com a saída.
- **Suíte verde não prova que sobe.** Dois bugs deste projeto passaram por 105
  testes verdes e só apareceram no `docker compose up`: o import errado do Baileys
  e o dashboard bindando `127.0.0.1` dentro do container. `test/smoke.test.js`
  existe por causa disso — ele carrega cada entrypoint e confere a API que promete.
  **Verifique rodando**, não só testando.
- **Todo texto vindo do participante é escapado** antes de ir para o HTML. O admin
  exibe nome, respostas de anamnese e conversas inteiras.
- **Ordem de leitura de configuração:** banco, depois ambiente (para as chaves que
  têm uma), depois a constante do código. Nem toda chave tem variável de ambiente —
  os horários padrão de gatilho nunca tiveram.

---

## 5. O backend administrativo

`src/dashboard/` deixou de ser somente leitura: é a superfície de operação do
piloto. Mesmo processo, mesma porta, mesmo bind em loopback — decomposto em
módulos.

```
src/dashboard/
  server.js          entrypoint: monta o app, bootstrap da conta, listen
  auth.js            sessão, cookie assinado, middleware, limite de tentativas
  senha.js           hash scrypt (sem dependência nativa nova)
  html.js            layout, escaping, navegação
  queries.js         agregações de leitura do painel
  rotas/
    login.js         login por e-mail e senha, logout
    painel.js        listagem, esteira, formulário de convite
    usuario.js       /usuarios/:id — leitura completa do participante
    acoes.js         escritas sobre participante + telas de confirmação
    admins.js        contas da equipe
    conta.js         trocar a própria senha
    conexao.js       estado do WhatsApp e QR como imagem
```

### Invariantes que não se negociam

- **Autenticação é por conta, nunca por senha compartilhada.** `ADMIN_PASSWORD` é
  semente de bootstrap, não credencial de login. Reintroduzir login por senha única
  faria a auditoria parar de saber quem agiu.
- **Comparação de senha em tempo constante**, e trabalho descartável quando o
  e-mail não existe — senão o tempo de resposta enumera contas.
- **Toda escrita é auditada**, e a auditoria nomeia o autor.
- **Confirmação em duas etapas para ação destrutiva.** O projeto não tem JavaScript
  de cliente; a página intermediária em GET faz o papel do `confirm()`. Ela descreve
  o efeito e não altera nada.
- **Guardas de servidor, não de interface.** Esconder o botão nunca basta: não se
  desativa a própria conta nem a última conta ativa, e não se convida quem já tem
  progresso de anamnese.
- **O formulário de login é publicamente alcançável** desde que o Basic Auth do
  Apache saiu. A proteção é atraso a cada falha (não contornável) mais bloqueio por
  origem (defesa em profundidade, forjável no cabeçalho de proxy). Nenhuma das duas
  substitui senha forte.

### Onde vai cada auditoria

| Ação | Destino | Por quê |
|---|---|---|
| Sobre um participante | `historico_interacoes`, `tipo='acao_admin'` | Fica na linha do tempo da pessoa, junto das conversas |
| Sobre a equipe (criar, desativar, resetar, entrar) | `auditoria_admin` | Não tem participante associado; `usuario_id` lá é `NOT NULL` |

Não unifique as duas. Tornar `usuario_id` anulável enfraqueceria a chave
estrangeira e quebraria a premissa de toda consulta existente, que assume a linha
do tempo de uma pessoa; inventar um participante-sistema poria dado falso na
contagem do painel.

## 6. Mudança de schema depois do pareamento

O schema usa `CREATE TABLE IF NOT EXISTS`: **um banco já existente não ganha
coluna nem tabela nova sozinho.** Até aqui, toda mudança de schema foi resolvida
recriando o volume, porque o banco estava vazio.

**Isso deixa de ser possível assim que o WhatsApp for pareado.** `/data/auth` vive
no mesmo volume: apagá-lo derruba a sessão, e reparear exige o chip em mãos.

A partir daí, mudança de schema pede script de migração. Em SQLite, alterar um
CHECK constraint não se faz com `ALTER TABLE`: dentro de uma transação e com
`PRAGMA foreign_keys=OFF`, cria-se a tabela nova com a constraint atualizada,
copiam-se os dados, dropa-se a antiga e renomeia-se. O `foreign_keys=OFF` é
essencial — sem ele, o `DROP` da tabela antiga dispara o CASCADE sobre as filhas.

**Antes de qualquer recriação, conte as linhas.** Não confie em verificação de
sessão anterior: ela tem data.

## 7. Este repositório vive no home da conta de hospedagem

A raiz do projeto é `/home/tdah`, que também é o home da conta (Virtualmin): `Maildir/`,
`public_html/`, `logs/`, `etc/`, `cgi-bin/`, `virtualmin-backup/`. Isso foi decisão explícita
do dono do projeto.

**Consequência obrigatória:** o `.gitignore` exclui todos esses diretórios. Antes de qualquer
`git add`, confira `git status` — **nunca** versione e-mail, site público ou backup.
Nunca rode `git add -A` sem olhar o que entrou.

---

## 8. Kits Xiax instalados (`.cursor/`) — escopo de cada um

Três kits foram copiados de `/home/tdah/md`. Eles foram escritos para o **Xiax Dashboard**
(Express + Prisma + MariaDB + Next.js) e para a **agência de landing pages** da Xiax — que são
projetos com outra stack. Aplique com discernimento:

| Ativo | Vale para o TARS? |
|---|---|
| `.cursor/rules/xiax-cursorrules.mdc` | **Parcialmente.** Vale: spec antes de código; commit local, push é decisão do time; código autodocumentado; nomenclatura. **Não vale:** Prisma, `companyId`/multi-tenancy, MariaDB, migrations, Next.js, Zod inline, `asyncHandler`/`AppError`/`notify`/`logActivity`, `.specs/` (aqui as specs são `openspec/`), `./scripts/validate.sh`. |
| `.cursor/skills/create-backend-module` | **Não.** É molde de rota Express+Prisma+Zod do Dashboard. |
| `.cursor/skills/deploy-sync` | **Não.** É o protocolo de deploy da VPS `/opt/gestaonossa`. O TARS sobe com `docker compose` próprio. |
| `.cursor/skills/code-review-standards`, `thermo-nuclear-code-quality-review` | **Sim, o espírito.** Rubrica de severidade, limites de tamanho de arquivo, caça a spaghetti e "code judo". Ignore as referências a Prisma/`companyId`/Next.js. |
| `.cursor/skills/accessibility-wcag`, `motion-qa`, `responsive-visual-qa`, `web-performance` | **Não.** São para landing page. O TARS não tem front-end público (o dashboard é uma tabela HTML local para 5 pessoas, de propósito). |
| `.cursor/agents/*` (ceo, producer-orquestrador, design-qa-visual, perf-engineer, a11y-auditor, qa-motion-adversarial) | **Não.** São a agência de landing pages. |
| `.cursor/agents/code-reviewer`, `head-of-quality` | **Sim, o espírito** (gate estático, `≥1 blocker ⇒ REJECTED`). |
| `.cursor/skills/source-command-opsx-*` | **Sim.** Atalhos para os comandos OpenSpec. |

Se uma regra de kit contrariar uma spec OpenSpec deste projeto, **a spec ganha** — e o conflito
deve ser apontado, conforme a regra 1.4.

**Sincronia dos kits:** `node .xiax-kits/<kit>/ai-check.mjs` relata divergências (não conserta).
As 5 skills `openspec-*` do kit `processo` vinham geradas pelo OpenSpec **1.6.0** e foram
**descartadas** na cópia em favor das geradas pelo `openspec init` **1.10.0** instalado aqui.
Esperado que `ai-check.mjs` acuse divergência nelas — é intencional.

---

## 9. Checklist antes de dizer "pronto"

- [ ] Li as specs aplicáveis e as listei no resumo final.
- [ ] Nenhuma alteração contraria uma spec aprovada.
- [ ] Conflitos e ambiguidades foram apontados, não resolvidos por conta própria.
- [ ] Spec criada/atualizada para toda funcionalidade nova.
- [ ] `openspec validate --all --no-interactive` executado — e passou.
- [ ] `npm test` executado — e o resultado real está no resumo.
- [ ] Subiu de verdade: `docker compose up -d --build` e o caminho afetado
      exercitado pelo domínio ou pelo loopback. Suíte verde não prova que sobe.
- [ ] Mudou schema? Contou as linhas antes de recriar, e conferiu se o WhatsApp
      já está pareado (ver §6).
- [ ] `git status` conferido: nada de `Maildir/`, `public_html/`, `logs/`, `.env`, `data/`, `auth/`.
- [ ] Resumo final lista specs lidas + comandos de validação executados.
