---
name: code-review-standards
description: Front-end code review standards — an 11-axis rubric, numeric severity (blocker/important/nit), and a Code Review Report with a verdict; the static gate that runs AFTER implementation and BEFORE the QA Report.
---

# Code Review Standards

## Purpose

Code review isn't a matter of taste — it's the static net that costs 1 to catch the defect that the QA Report catches for 10 and production for 100. This skill defines the rubric, the severity scale, and the finding format that turn "I thought it looked ugly" into an auditable verdict, anchored in the project's global quality rules (TypeScript `strict`, zero `any`, DRY), in the canonical artifacts that already settled what's right — the **Front-end Architecture** (RSC/Client boundary, `cn()`, a single Zod schema), the **Design System** / DESIGN.md §2 (tokens, `cva`, Radix), and the **Component Library** — and in the `perf-a11y-motion` skill (a11y and performance in code). It is consumed by whoever writes the code — the Motion Engineer (`motion-engineer`) and the UI Engineer (`ui-engineer`) submit the diff — and executed by the reviewer, the Code Reviewer (`code-reviewer`), owner of this skill; the verdict is validated by the Producer (`producer-orquestrador`), who only releases the handoff to the QA Report (`motion-qa`) when the result is APPROVED. Non-negotiable division of labor: **code review reads the diff (static); `motion-qa` measures the runtime (dynamic)** — both gates are mandatory and neither substitutes for the other.

## Golden rules

None of the rules below can be relaxed. Violations fail the **Code Review Report** and block the handoff to the QA Report.

1. **The automated gate passes BEFORE any human eyes.** `tsc --noEmit` + `eslint --max-warnings=0` (Step A — defect rules only, `error`) + `knip` + `prettier --check` all green is a precondition for manual review; size/complexity rules (`warn`) run in a Step B `eslint` pass WITHOUT `--max-warnings=0` (they count as "important", they don't block the gate — see §2/§7). *Why:* human attention is the expensive resource — spending it on what the linter already catches wastes the one perspective that can see architecture, correctness, and semantic a11y.
2. **Every finding has `file:line` + problem + fix.** All three parts, or it isn't a finding, it's an opinion. *Why:* review with no location and no actionable fix isn't traceable or fixable — it turns into ping-pong and nobody knows if it's resolved.
3. **Severity decides the verdict by number, not by mood.** `≥1 blocker ⇒ REJECTED`; `0 blockers and ≥1 important ⇒ APPROVED WITH RESERVATIONS` (each important becomes an issue with an owner); `0/0 ⇒ APPROVED` (nits don't block). *Why:* a subjective verdict blocks a good merge and lets a bad merge through; a numeric rule is auditable and identical across reviewers.
4. **`strict: true`, zero `any`, zero gratuitous `as`.** `any` and `as unknown as T` outside a typed boundary are **blockers**. *Why:* an `any` turns off type checking for the ENTIRE graph that touches that value — the error resurfaces at runtime, on the client (a global project rule).
5. **The RSC/Client boundary lives at the leaves.** `'use client'` only on the leaf component that needs state/effect/event/browser API; never on `layout.tsx`/`page.tsx` or a whole section. *Why:* pushing the directive up drags server sections into the bundle and kills LCP/TBT (see the Front-end Architecture).
6. **Conversion and SEO content exists in the server's HTML.** Headline/subhead/CTA/proof and metadata appear before any JS. *Why:* it IS the LCP and indexing; motion is decoration layered on top — if the diff moves this to the client, it fails.
7. **Reuse by the rule of three; one component, one responsibility.** Duplication becomes an abstraction on the 3rd occurrence **or** starting at ~8 identical lines in 2 places; a component with > 1 reason to change gets split. *Why:* abstracting too early couples what should have varied; too late is debt — the number decides, not taste.
8. **A11y is code, not final polish.** Associated `label`, intentional `alt`, visible focus, target ≥ 24×24 (aim for 44×44), `aria-hidden` on decoratives, heading order — WCAG 2.2 AA. *Why:* wrong semantics exclude real users and fail QA (see `perf-a11y-motion`); it's a blocker, not a nit.
9. **Zero `console.*`, dead code, unused import/variable, `debugger`.** `knip` + `eslint` catch these; none of them cross the merge. *Why:* it's a cost and noise the user pays in bytes and the team pays in code readability (a global rule).
10. **No magic numbers — motion or design.** Duration/ease/stagger/scrub only from `lib/motion/motion-tokens.ts`; color/radius/shadow only from the landing's real semantic tokens (`--bg/--fg/--mut/--card/--brd/--brd2/--ac/--ac-t/--acfg`, blueprint accent `#3E63A8` — source of truth in DESIGN.md §2). The accent has **two** load-bearing tokens: **fill** uses `--ac` + `--acfg` (text over the fill); **text/stroke** uses `--ac-t` (lightens to `#8fb0e6` on dark, ~9:1 contrast). Using `--ac` where it should be `--ac-t` is a contrast error; never reintroduce cream as an accent. *Why:* a literal doesn't flip with the theme, drifts between sections, and fails `motion-qa` (see `motion-foundation` and the Design System / DESIGN.md §2).
11. **Performance is reviewed in the diff, proven at runtime.** A stable `key` (never an array index in a reorderable list), memo only where a re-render has been measured, no inline arrow functions in hot-list JSX. *Why:* the review catches the cause in the code; the number (FPS/INP) belongs to `motion-qa` — the cheap review keeps the expensive gate from failing on something obvious.
12. **Basic security is a blocker, not a style preference.** No secrets in the client bundle (only `NEXT_PUBLIC_*` is public, and by explicit decision); `dangerouslySetInnerHTML` only with sanitized HTML or JSON-LD with `<` escaped; input validated on the server with the SAME Zod schema. *Why:* a leaked secret or XSS isn't a cosmetic bug — it's an incident with the client's name in the headline.
13. **Ordered imports, `type`-only, and absolute `@/`.** externals → `import type` → local → `@/…`; never `../../..`. *Why:* type-only disappears from the bundle, stable ordering reduces merge conflicts, and an absolute path survives refactors (a global rule; `@/*` → `./src/*` in the real `tsconfig`).

## Techniques

### 1. Automated gate before human review

The reviewer doesn't read a diff that hasn't passed the machine. Run it at the root of `frontend/` and only then open the files:

```bash
npx tsc --noEmit                                   # types: zero errors (strict) — rule 4
# Step A — defect gate: only `error` rules; size/complexity disabled to NOT trip --max-warnings=0
npx eslint "src/**/*.{ts,tsx}" --max-warnings=0 \
  --rule '{"max-lines-per-function":"off","complexity":"off","max-depth":"off"}'   # rubric-as-rule — rules 8/9/11/13
# Step B — size/complexity: WITHOUT --max-warnings=0; the count becomes "important" in the report (§2/§7), doesn't block the gate
npx eslint "src/**/*.{ts,tsx}"                     # rule 7 (max-lines-per-function/complexity/max-depth = warn)
npx prettier --check "src/**/*.{ts,tsx}"           # formatting: outside the scope of human eyes
npx knip                                           # dead code: unused files/exports/deps — rule 9
```

Extend the project's real flat config (`eslint.config.mjs`, which already uses `@typescript-eslint/parser` + `@next/eslint-plugin-next`) to turn every rubric axis into a gate. Defect rules are `error` (Step A, with `--max-warnings=0`); size/complexity rules are `warn` and would trip `--max-warnings=0` — that's why they run in Step B, WITHOUT `--max-warnings=0`, and become "important" (never block the gate; see §2/§7):

```js
// eslint.config.mjs — each rule below turns a rubric axis into a machine check
import tsParser from '@typescript-eslint/parser'
import tsPlugin from '@typescript-eslint/eslint-plugin'
import nextPlugin from '@next/eslint-plugin-next'
import reactPlugin from 'eslint-plugin-react'
import reactHooks from 'eslint-plugin-react-hooks'
import jsxA11y from 'eslint-plugin-jsx-a11y'
import importPlugin from 'eslint-plugin-import'

export default [
  { ignores: ['.next/**', 'node_modules/**', 'dist/**'] },
  {
    files: ['src/**/*.{ts,tsx}'],
    languageOptions: {
      parser: tsParser,
      parserOptions: { project: './tsconfig.json', ecmaFeatures: { jsx: true } }, // type-aware: costs time, enables the type rules
    },
    plugins: {
      '@typescript-eslint': tsPlugin, '@next/next': nextPlugin, react: reactPlugin,
      'react-hooks': reactHooks, 'jsx-a11y': jsxA11y, import: importPlugin,
    },
    settings: { react: { version: 'detect' } },
    rules: {
      // Rule 4 — TS strict: any/unused/non-null-assertion are ERROR, not warning
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/no-non-null-assertion': 'error',   // bans `!` (gratuitous assertion)
      '@typescript-eslint/consistent-type-imports': 'error', // enforces `import type` (rule 13)
      // Rule 9 — noise/dead code
      'no-console': 'error', 'no-debugger': 'error',
      // Rule 11 — performance in the diff
      'react/no-array-index-key': 'error',        // key = index in a reorderable list = reconciliation bug
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'error',     // wrong deps = stale closure or render loop
      // Rule 8 — a11y in the code (the plugin's floor; the human checks the rest)
      ...jsxA11y.flatConfigs.recommended.rules,   // older versions: migrate from `.configs.recommended`
      // Rule 13 — ordered imports
      'import/order': ['error', {
        groups: ['builtin', 'external', 'type', 'internal', ['parent', 'sibling', 'index']],
        pathGroups: [{ pattern: '@/**', group: 'internal' }],
        'newlines-between': 'always', alphabetize: { order: 'asc' },
      }],
      // Rule 7 — size/complexity (warn: these are "important", judged in the diff — see §7)
      'max-lines-per-function': ['warn', { max: 50, skipComments: true, skipBlankLines: true }],
      complexity: ['warn', 10], 'max-depth': ['warn', 3],
    },
  },
]
```

The linter is the **floor**, not the ceiling: it proves the absence of `any` and `console`, never that the component is at the right boundary, that the abstraction is the correct DRY call, or that the `alt` describes the image. That's the job of techniques §5–§10.

### 2. Severity model and verdict rule

Three levels, each with an objective entry criterion — no "it depends":

| Severity | Enters here when… | Effect on the merge |
|---|---|---|
| **Blocker** | broken correctness; `any`/`as` that turns off checking; wrong RSC/Client boundary; WCAG 2.2 AA a11y violated; secret in the client; unsanitized `dangerouslySetInnerHTML`; magic motion number; conversion content outside the server HTML | **FORBIDDEN.** ≥1 ⇒ verdict REJECTED |
| **Important** | DRY violated (≥3 occurrences or ≥8 repeated lines); function body > 50 lines; component with >1 responsibility; missing/unstable `key`; missing memo where a re-render was measured; naming off-pattern in a public API | Fixed before the merge; each one becomes a tracked issue with an owner |
| **Nit** | import order; formatting Prettier resolves; suboptimal local variable name; redundant comment | Doesn't block; group into a single comment |

Verdict rule, applied mechanically:

- **REJECTED** — `≥1 blocker`. Goes back to `motion-engineer`/`ui-engineer` with the list.
- **APPROVED WITH RESERVATIONS** — `0 blockers` and `≥1 important`. Each important issue needs to become a tracked issue with an owner and deadline, or it becomes a blocker.
- **APPROVED** — `0 blockers` and `0 important`. Nits are logged, they don't block.

The reviewer does **not** fix — they point out and hand back; mixing author and reviewer hides regressions (the same principle as `motion-qa`).

### 3. Finding format

A finding is a closed unit. Outside this format, discard it:

```text
[SEVERITY] path/to/file.tsx:LINE — <rubric axis>
Problem: <what's wrong in 1 sentence, with the physical/measurable why>
Fix: <the exact change; snippet only if the text is load-bearing>
```

Real example:

```text
[BLOCKER] src/components/landing/pricing.tsx:42 — TypeScript strict
Problem: `plan as any` turns off checking at the point that decides the price; a field renamed in the Zod schema slips past review and becomes a runtime error on the client's invoice.
Fix: type it via `z.infer<typeof planSchema>` and narrow with the `isPaidPlan(plan)` guard; remove the `as any`.
```

### 4. The 11-axis rubric

The reviewer walks the diff once per axis — each row of the table is a pass, with a severity floor and the tool that helps:

| # | Axis | What to check | Floor | Helper |
|---|---|---|---|---|
| 1 | Correctness | edge cases, error/empty/loading states, data contract, off-by-one | Blocker | tests + reading |
| 2 | Componentization & DRY | rule of three, single responsibility, cohesive props | Important | §7 |
| 3 | TypeScript strict | zero `any`, explicit types on the API, no gratuitous `as` | Blocker | `tsc` + `no-explicit-any` |
| 4 | Naming | `PascalCase`/`camelCase`/`UPPER_SNAKE_CASE`, hyphenated file names | Nit (Important on a public API) | eslint + reading |
| 5 | Imports | externals→`type`→local→`@/`, no `../../..` | Nit | `import/order` |
| 6 | RSC/Client boundary | `'use client'` only on the leaf that needs it | Blocker | §6 + grep |
| 7 | A11y in the code | label, alt, role, focus, target, decorative `aria-hidden` | Blocker | `jsx-a11y` + §8 |
| 8 | Hygiene | no `console.*`/dead code/unused import/`debugger` | Important | `eslint` + `knip` |
| 9 | Function size | body ≤ 50 lines, nesting ≤ 3 | Important | `max-lines-per-function` |
| 10 | Performance | stable `key`, memo where it matters, no hot inline arrows, motion tokens | Important (Blocker if `key`=index causes a bug) | §9 + `react-scan` (dev) |
| 11 | Security | no secret in the client, sanitized `dangerouslySetInnerHTML`, input validated on the server | Blocker | §10 + grep |

### 5. TypeScript strict: `any`, `as`, and explicit types

`any` and gratuitous `as` are the two holes that void the `tsconfig`'s `strict: true`. Fail both:

```ts
// REJECTED
function total(items: any): number {          // any: turns off checking for the whole array
  return items.reduce((s, i) => s + i.price, 0)
}
const plan = data.plan as PlanTier            // gratuitous as: lies if data.plan changes shape

// APPROVED
import type { LineItem, PlanTier } from '@/types'   // reusable types live in src/types/
function total(items: readonly LineItem[]): number {
  return items.reduce((sum, item) => sum + item.price, 0)
}
const plan: PlanTier = planSchema.parse(data).plan  // validated at runtime, not asserted (a global rule)
```

**CLOSED exception for `as`** (only these, always with a comment explaining why): `as const` (readonly literal); narrowing after a check the compiler can't see; and the test-instrumentation boundary (`motion-qa`'s `as unknown as {...}` to access `window.__qa` is the one enumerated example). Any `as` outside of this, or `as unknown as T` in product code, is a blocker. Class inheritance is banned (composition) — the global rule applies in review.

### 6. RSC/Client boundary

One-pass heuristic: `grep -rn "'use client'" src/` and, for every occurrence, ask "does this leaf REALLY use `useState`/`useEffect`/`onX`/`window`?". A file with the directive and none of them = blocker (dragged the server into the bundle for nothing).

```tsx
// REJECTED — 'use client' on the whole section: h1/p/CTA server content turns into client bundle, LCP tanks
'use client'
export function Hero({ headline }: { headline: string }) {
  return (<section><h1>{headline}</h1>{/* ... and an onClick lost in the middle */}</section>)
}

// APPROVED — the section is RSC; only the click is a client island (leaf)
import { CtaButton } from '@/components/ui/cta-button' // 'use client' lives HERE, at the leaf
export function Hero({ headline }: { headline: string }) {   // Server Component
  return (
    <section>
      <h1>{headline}</h1>
      <CtaButton event={{ name: 'hero_cta_click' }}>Get started</CtaButton>
    </section>
  )
}
```

Also a blocker in this pass: `dynamic(() => import(...), { ssr: false })` called directly from an RSC (a build error — isolate it in a client wrapper, see the Front-end Architecture); and a manual `next/head`/`<title>` in the App Router (use the Metadata API).

### 7. Reuse/DRY, single responsibility, and function size

The criterion is numeric, so it doesn't fall into "abstract with good judgment": extract on the **3rd occurrence** or starting at **~8 identical lines** in 2 places — before that, duplicating is cheaper than the wrong abstraction.

```ts
// REJECTED — the same discount calculation copied across 3 files (3rd occurrence triggers extraction)

// APPROVED — one pure, typed function, tested once, imported by all 3
// src/lib/pricing/discount.ts
export function applyDiscount(cents: number, pct: number): number {
  return Math.round(cents * (1 - pct / 100)) // rounds in cents: avoids a fractional-currency error on the invoice
}
```

Function size: **50 lines of executable body** (don't count purely declarative JSX — a long `return (<...>)` with shallow logic doesn't violate it; what violates it is dense logic or > 1 responsibility). Dual-responsibility signals that fail: the component fetches data **and** formats **and** animates; the function validates **and** persists **and** fires analytics. Nesting > 3 levels (`max-depth`) is important — extract an early-return or a helper function.

### 8. A11y in the code

`jsx-a11y` catches most of the mechanical stuff; the human checks what it can't judge (whether the `alt` describes the image, whether the heading order is logical, whether focus follows the reading flow).

```tsx
// REJECTED
<div onClick={submit}>Submit</div>   // clickable div: no focus, no keyboard, no role
<img src="/hero.png" />              // no alt: the screen reader reads the filename
<input />                            // orphan input: no associated label

// APPROVED
<button type="button" onClick={submit}>Submit</button>          // native focus+keyboard+role for free
<img src="/hero.png" alt="Filled-out management record" />      // decorative? alt="" + aria-hidden="true"
<label htmlFor="email">Email</label>
<input id="email" type="email" inputMode="email" />
```

A11y checklist per diff: interactive target ≥ 24×24 CSS px (aim for 44×44 via `min-h-11`, WCAG 2.5.8); visible focus never removed without a ≥ 3:1 substitute; `aria-hidden="true"` on every animated decorative (ascii, cursor, rulers — see `perf-a11y-motion`); contrast 4.5:1 text / 3:1 UI validated in both token scopes (dark and paper). Contrast and target size are blockers: WCAG 2.2 AA is a gate, not a goal.

### 9. Performance in the diff

The review catches the **cause** in the code; the **number** (FPS p95, INP) belongs to `motion-qa`. The most common causal targets:

```tsx
// REJECTED — key=index in a list that reorders/filters; inline arrow recreated on every render
{items.map((it, i) => <Row key={i} onClick={() => select(it.id)} />)}

// APPROVED — stable key by identity; stable handler when the child is memoized
const onSelect = useCallback((id: string) => select(id), [select])
{items.map((it) => <Row key={it.id} id={it.id} onSelect={onSelect} />)}
```

Decision rule for memo: apply `React.memo`/`useMemo`/`useCallback` **only when `react-scan`** (dev, see `perf-a11y-motion`) **shows the component re-rendering with no prop change** — cargo-cult memoization is noise that hides the real bottleneck. And a magic motion number in the diff is a blocker here: inline `duration: 0.8`/`ease: 'power3.out'` fails — only `DUR.reveal`/`EASE.enter` from `lib/motion/motion-tokens.ts` (canonical ranges: micro `0.2–0.4s` · reveal `0.6–0.9s` · hero `1.0–1.6s`; numeric scrub `0.5–1.5`, never `scrub: true`).

### 10. Basic security

Three checks, all blockers:

```tsx
// (a) dangerouslySetInnerHTML — XSS
<div dangerouslySetInnerHTML={{ __html: userBio }} />                       // REJECTED: untrusted HTML straight into the DOM
<div>{userBio}</div>                                                        // APPROVED: render as text
import DOMPurify from 'isomorphic-dompurify'
<div dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(richHtml) }} />  // APPROVED: rich text? sanitize on the server
<script type="application/ld+json"
  dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, '\\u003c') }} /> // APPROVED: JSON-LD with < escaped
```

```ts
// (b) secret in the client — leaks into the bundle
const key = process.env.STRIPE_SECRET_KEY   // REJECTED in a Client Component: undefined OR leaks if prefixed NEXT_PUBLIC_
// APPROVED: secrets only in a Server Action / Route Handler / RSC ('use server'); only NEXT_PUBLIC_* is public, by decision
```

```ts
// (c) user input validated on the SERVER with the same Zod schema (client is convenience, server is the boundary)
const parsed = subscribeSchema.safeParse(formData) // REJECTED if validation only exists on the client
if (!parsed.success) return { status: 'error', fieldErrors: parsed.error.flatten().fieldErrors }
```

### 11. Code Review Report (the output, with a verdict)

Fill it out and attach it to the PR. With no severity count and no verdict, it's not a report:

```markdown
# Code Review Report — <project> — <PR/branch> — commit <sha>
## Verdict: APPROVED | APPROVED WITH RESERVATIONS | REJECTED

## Scope
- Diff: <N files · +X/-Y lines> · Base: Front-end Architecture / Component Library / Design System / Technical Storyboard
- Automated gate: tsc --noEmit [ ] · eslint --max-warnings=0 (Step A) [ ] · eslint without --max-warnings=0 (Step B, size→important) [ ] · knip [ ] · prettier --check [ ]

## Count by severity (the verdict rule is mechanical)
| Severity | Count | Rule |
|---|---|---|
| Blocker | 0 | ≥1 ⇒ REJECTED |
| Important | 0 | ≥1 (and 0 blockers) ⇒ APPROVED WITH RESERVATIONS — each one becomes an issue with an owner |
| Nit | 0 | doesn't block |

## Findings (blocker → important → nit)
[SEVERITY] file:line — axis
Problem: ...
Fix: ...

## Handoff
- Blockers/important issues returned to motion-engineer / ui-engineer.
- APPROVED ⇒ Producer (producer-orquestrador) releases the QA Report (motion-qa).
```

## Libraries and plugins

| Package | Version | Install | When to use |
|---|---|---|---|
| `typescript` | `^5.6` | `npm i -D typescript@^5.6` | `tsc --noEmit`: type gate (strict) before manual review — rule 1/4 |
| `eslint` | `^8.57` (the project's real pin; already supports flat config via `eslint.config.mjs`, with `eslint-config-next@^15.5`) | (already installed; **don't** bump to `9` without confirming — it's a major version with breaking changes and compatibility with `eslint-config-next@15` needs to be validated) | Runner for the rubric-as-rule setup (§1) |
| `@typescript-eslint/parser` | `^8` (confirm the latest on npm) | `npm i -D @typescript-eslint/parser` | TS parser for the flat config (already present in the project) |
| `@typescript-eslint/eslint-plugin` | `^8` (confirm the latest on npm) | `npm i -D @typescript-eslint/eslint-plugin` | `no-explicit-any`, `no-unused-vars`, `consistent-type-imports` — rules 4/13 |
| `@next/eslint-plugin-next` | tracks `next@^15.5` | (already installed with `next`) | App Router-specific rules (already present in the project) |
| `eslint-plugin-jsx-a11y` | `^6` (confirm the latest on npm) | `npm i -D eslint-plugin-jsx-a11y` | The a11y floor in the code — axis 7/rule 8 |
| `eslint-plugin-react` | `^7` (confirm the latest on npm) | `npm i -D eslint-plugin-react` | `no-array-index-key` and JSX rules — axis 10 |
| `eslint-plugin-react-hooks` | confirm the latest on npm | `npm i -D eslint-plugin-react-hooks` | `rules-of-hooks`, `exhaustive-deps` — wrong deps = re-render/stale |
| `eslint-plugin-import` | confirm the latest on npm | `npm i -D eslint-plugin-import` | `import/order` — rule 13 |
| `knip` | confirm the latest on npm | `npm i -D knip` | Dead code: unused files/exports/deps — rule 9 |
| `prettier` | `^3` (confirm the latest on npm) | `npm i -D prettier` | `--check`: formatting outside the scope of human eyes |
| `isomorphic-dompurify` | confirm the latest on npm | `npm i isomorphic-dompurify` | Sanitize HTML when rich-text `dangerouslySetInnerHTML` is unavoidable — rule 12 |

- **Governed by other artifacts/skills (cited only in the examples, not installed by this one):** `react-scan` (`^0.5.7`, dev — hunt re-renders, from the `perf-a11y-motion` skill); `zod` (`^4.0`) and `schema-dts` (`^1.1`) from the Front-end Architecture; `class-variance-authority` (`^0.7.1`), `tailwind-merge` (`^2.6.0`, v2 series for Tailwind v3), and `clsx` (`^2.1.1`) make up the Design System's `cn()`/`cva`. The review checks their correct USE; it doesn't redefine the version.
- **Note on the gate by severity:** `--max-warnings=0` trips on any `warn` — that's why §1's standard flow is two steps: **Step A** (`--max-warnings=0`, with size/complexity rules disabled) for `error` defects, and **Step B** (`eslint` without `--max-warnings=0`) for `max-lines-per-function`/`complexity`/`max-depth`, whose count becomes "important" in the report. Never remove these rules.

## Anti-patterns

- **Manually reviewing what the linter already catches** (`console`, `any`, unused import) → spends the expensive perspective on the cheap stuff and lets architecture/correctness slip through; symptom: a report full of nits and no real blocker found.
- **A finding with no `file:line` or no fix** → the author doesn't know where or how to fix it; symptom: an endless back-and-forth, the PR rots.
- **Verdict by gut feeling** ("good enough") → inconsistent merges across reviewers; symptom: the same bug class fails one PR and passes the next.
- **"Temporary" `any`/`as unknown as T`** → turns off checking for the entire graph; symptom: a type error becomes a runtime error on the client weeks later.
- **`'use client'` on a section to "fix it quickly"** → server content turns into a client bundle; symptom: the hero only appears after hydration, LCP and SEO drop.
- **Abstracting on the 2nd occurrence** → couples what would still have diverged; symptom: a function with 6 boolean flags to serve 3 different callers.
- **`key={index}` in a list that filters/reorders** → reconciliation targets the wrong node; symptom: a typed input "jumps" rows, state sticks to the wrong item.
- **Memoizing everything "just to be safe"** → cargo-cult `useMemo`/`memo`; symptom: more code, deps that break, and the real bottleneck stays invisible.
- **`div` with `onClick` instead of `button`** → no focus or keyboard; symptom: keyboard/screen-reader users can't activate it, fails WCAG.
- **Generic `alt`** ("image", "photo") **or missing** → `jsx-a11y` even passes with `alt=""`, but bad text is misleading; symptom: the screen reader narrates garbage — the human has to judge the `alt` content.
- **Secret read in a Client Component** → leaks into the public bundle; symptom: an API key shows up in the browser's source.
- **Unsanitized `dangerouslySetInnerHTML` with user data** → XSS; symptom: the attacker's `<script>` executes on the client's domain.
- **Inline motion/design number in the diff** → drifts between sections and fails `motion-qa`; symptom: every section with a slightly different rhythm/color.
- **Reviewer fixing the code instead of pointing it out** → the author doesn't learn, the regression comes back; symptom: the same defect reappears in the same author's next PR.

## Approval checklist

Answer yes/no. Any "no" blocks the handoff to the QA Report (`motion-qa`, `qa-motion-adversarial`); the Producer (`producer-orquestrador`) only declares the diff ready when the verdict is APPROVED.

- [ ] Is the automated gate green before reading: `tsc --noEmit`, `eslint --max-warnings=0` (Step A, defect) + `eslint` without `--max-warnings=0` (Step B, size/complexity → "important"), `knip`, `prettier --check`?
- [ ] Does every finding have `file:line` + problem + an actionable fix?
- [ ] Is the verdict derived by the numeric rule (≥1 blocker ⇒ REJECTED; ≥1 important ⇒ WITH RESERVATIONS; 0/0 ⇒ APPROVED), not by opinion?
- [ ] Zero `any` and zero `as` outside the closed exception (`as const`, commented narrowing, test boundary)?
- [ ] Is `'use client'` only on leaves that use state/effect/event/browser API; no server section dragged along?
- [ ] Are headline/subhead/CTA/proof and metadata in the server's HTML (conversion content kept out of the client)?
- [ ] No duplication beyond the rule of three; no component with > 1 responsibility; functions ≤ 50 lines of body and nesting ≤ 3?
- [ ] A11y: intentional `label`/`alt`/visible focus/target ≥ 24×24/decorative `aria-hidden`/contrast 4.5:1 and 3:1 in both scopes?
- [ ] Zero `console.*`/dead code/unused import/`debugger` (confirmed by `eslint` + `knip`)?
- [ ] No magic numbers: motion only from `lib/motion/motion-tokens.ts`, color/radius/shadow only from the landing's real tokens (`--bg/--fg/--mut/--card/--brd/--brd2/--ac/--ac-t/--acfg`, DESIGN.md §2), with the right accent (`--ac`/`--acfg` for fill, `--ac-t` for text/stroke)?
- [ ] Performance: stable `key`, memo only where `react-scan` shows a re-render, no inline arrows in hot JSX?
- [ ] Security: no secret in the client, `dangerouslySetInnerHTML` only sanitized/JSON-LD escaped, input re-validated on the server with the same Zod schema?
- [ ] Ordered imports, `import type`, and `@/` paths (no `../../..`); names in `PascalCase`/`camelCase`/`UPPER_SNAKE_CASE` and hyphenated files?
- [ ] Is the **Code Review Report** filled out, with a count by severity and a verdict, attached to the PR and addressed to `motion-engineer`/`ui-engineer`?
