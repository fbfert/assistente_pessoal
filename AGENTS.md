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
- **Segurança de rede:** o dashboard roda **somente** em `127.0.0.1` (bind `127.0.0.1:3300`),
  nunca em interface pública. Acesso é via túnel SSH. Isso é decisão de segurança, não detalhe.
- **Segredos nunca entram no Git.** `.env` é gitignored; `.env.example` documenta as variáveis
  sem valores.
- **Testes:** `node --test test/`. Rode antes de considerar qualquer etapa concluída e reporte
  o resultado real — teste que falha se reporta como falha, com a saída.

---

## 5. Este repositório vive no home da conta de hospedagem

A raiz do projeto é `/home/tdah`, que também é o home da conta (Virtualmin): `Maildir/`,
`public_html/`, `logs/`, `etc/`, `cgi-bin/`, `virtualmin-backup/`. Isso foi decisão explícita
do dono do projeto.

**Consequência obrigatória:** o `.gitignore` exclui todos esses diretórios. Antes de qualquer
`git add`, confira `git status` — **nunca** versione e-mail, site público ou backup.
Nunca rode `git add -A` sem olhar o que entrou.

---

## 6. Kits Xiax instalados (`.cursor/`) — escopo de cada um

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

## 7. Checklist antes de dizer "pronto"

- [ ] Li as specs aplicáveis e as listei no resumo final.
- [ ] Nenhuma alteração contraria uma spec aprovada.
- [ ] Conflitos e ambiguidades foram apontados, não resolvidos por conta própria.
- [ ] Spec criada/atualizada para toda funcionalidade nova.
- [ ] `openspec validate --all --no-interactive` executado — e passou.
- [ ] `node --test test/` executado — e o resultado real está no resumo.
- [ ] `git status` conferido: nada de `Maildir/`, `public_html/`, `logs/`, `.env`, `data/`, `auth/`.
- [ ] Resumo final lista specs lidas + comandos de validação executados.
