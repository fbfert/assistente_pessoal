---
name: accessibility-wcag
description: Ensures WCAG 2.2 AA across the entire LP — semantic HTML and landmarks, a single h1, contrast and non-color cues, focus, keyboard, correct ARIA (inherited from Radix), forms and images, validated by an axe gate plus a manual pass. Use when building or reviewing any markup, interactive component, or form.
---

# WCAG 2.2 AA Accessibility

## Purpose

A screen reader doesn't see your CSS — it reads your markup; and wrong ARIA is worse than no ARIA at all. This skill guarantees WCAG 2.2 AA across the entire landing page, treated as a semantic document that is keyboard-operable and readable by assistive technology: semantic HTML + landmarks, a single `<h1>` and heading hierarchy, contrast and non-color cues, visible focus and focus order, full keyboard support, correct ARIA (inherited from the Component Library's Radix primitives, never reinvented), forms and images — proven by an `@axe-core/playwright` gate plus a manual keyboard and screen-reader pass, consolidated into the **A11y Report**. There's an explicit boundary with `perf-a11y-motion`: that skill owns the accessibility CREATED by motion (reduced-motion, focus not trapped by scroll/pin, animated decoratives with `aria-hidden`, nothing flashing > 3×/s); this one owns THE REST of WCAG 2.2 AA — no duplication, no gap. It's consumed by `ui-engineer` and `nextjs-arquiteto` when writing markup and components; the palette it validates is born in the `diretor-criativo`'s Creative Direction and arrives via the Design System. Audited by `a11y-auditor`, who runs axe and the manual pass and consolidates the A11y Report; `producer-orquestrador` re-verifies it in the Release Checklist.

## Golden rules

None of the rules below can be relaxed. Violations fail the QA Report.

1. **The target is WCAG 2.2 AA, not 2.1.** There are 86 criteria; 2.2 has been a W3C Recommendation since Oct/2023, backward-compatible with 2.1 except 4.1.1 Parsing (obsolete, removed). *Why:* you measure against the current standard — the 9 new criteria (target size, focus not obscured, consistent help, redundant entry) land exactly on an LP's surfaces (sticky header, CTA, form).
2. **Semantic HTML first; ARIA only where native markup falls short.** Real landmarks (`<header> <nav> <main> <footer>`), `<button>` for actions and `<a href>` for navigation — never `<div onClick>`. *Why:* native elements give you role, focus, and keyboard for free; recreating them with `div`+ARIA is where almost every a11y bug is born.
3. **A single `<h1>` per page and a heading hierarchy that never skips a level.** Visual size is CSS; level is semantics — never pick `<h3>` "because it's smaller". *Why:* screen readers navigate by heading (the `H` key); `h1`→`h3` without `h2` breaks the page's mental index.
4. **"No ARIA is better than wrong ARIA" (the 1st Rule of ARIA).** Don't add `role`/`aria-*` that the native element or the Radix primitive already provides; redundant or contradictory ARIA misleads assistive technology. *Why:* ARIA doesn't add behavior, only semantics — and wrong semantics are actively worse than none (`role="button"` on a `<button>` does nothing; `aria-label` that diverges from the visible text breaks "click what I read").
5. **Any interactive widget (dialog, dropdown, tabs, accordion, popover, tooltip, select, switch) comes from Radix, styled 100% via Tailwind + `cva`.** *Why:* Radix ships tested WAI-ARIA + focus management + keyboard support (arrows, roving tabindex, `Esc`, focus return); reimplementing this by hand is rework that fails axe and the keyboard walk.
6. **Contrast ≥ 4.5:1 for normal text; ≥ 3:1 for large text (≥ 24px, or ≥ 18.66px bold) and UI components / focus indicators.** Verified with a number, in both token scopes (dark `.page` and paper `.light`/`.paperbox`), the blue accent included. *Why:* it's 1.4.3 + 1.4.11; aesthetics don't exempt the token — the accent `#8fb0e6` (dark) / `#3E63A8` (paper) must pass over EVERY background it appears on.
7. **Color is never the only channel of information.** Error, success, link, active state also carry text, icon, underline, or shape. *Why:* 1.4.1 — ~8% of men are colorblind; a "field in red" without error text is invisible to them.
8. **Focus ALWAYS visible via `:focus-visible`, contrast ≥ 3:1 against the adjacent background; `outline: none` only with an equivalent replacement.** *Why:* the AA focus bar is 2.4.7 + the 3:1 of 1.4.11 (2.4.13 Focus Appearance is AAA, out of scope); removing the outline without a substitute leaves keyboard users navigating blind.
9. **Everything operable by mouse is operable by keyboard, without traps, in reading order; the skip link is the 1st focusable element.** No positive `tabindex`; DOM in visual order. *Why:* 2.1.1 / 2.1.2 / 2.4.1 / 2.4.3 — `tabindex="5"` creates a parallel order impossible to maintain, and without a skip link the keyboard has to traverse the entire header on every page.
10. **A focused component is never fully covered by a sticky header, cookie banner, or chat widget (2.4.11, NEW in 2.2 AA).** *Why:* scrolling to a field whose focus disappears behind the fixed header leaves keyboard users not knowing where they are — solved with `scroll-margin-top` ≥ header height.
11. **Pointer target ≥ 24×24 CSS px (2.5.8, NEW in 2.2 AA), with spacing when smaller.** *Why:* 24px is the AA floor (44×44 is 2.5.5 Enhanced, AAA, not required); a tiny target fails fine-motor and touch use.
12. **Every form control has an associated `<label>`; errors exposed programmatically with `aria-invalid` + `aria-describedby`, never color alone.** *Why:* 1.3.1 / 3.3.1 / 4.1.2 — placeholder is not a label (it disappears while typing) and a visual-only error never reaches the screen reader.
13. **Every image has `alt`: meaningful when it conveys information, `alt=""` when decorative; icon-only gets `aria-label`.** *Why:* 1.1.1 — missing `alt` makes the screen reader read the filename; `alt=""` removes the decorative noise; a button with no visible text has no accessible name without `aria-label`.
14. **Dynamic content (validation, toast, counter, filter) announced by `aria-live` in the right region.** *Why:* 4.1.3 — a visual change that doesn't go through a live region is silent for anyone who can't see the screen.
15. **Reduced motion, focus not trapped by scroll/pin, animated decoratives with `aria-hidden`, and flashing > 3×/s belong to `perf-a11y-motion`.** *Why:* accessibility created by motion is audited there; this skill covers the rest of WCAG 2.2 AA — the split avoids both gaps and double-checking.

## Techniques

### 1. Semantic structure: landmarks, skip link, one h1, and hierarchy

One landmark of each type per page; `<main>` receives the skip link's target. Size is CSS, level is semantics — the giant section number (a signature of `art-direction-anti-slop`) is decorative, not a heading.

```tsx
// app/(marketing)/page.tsx — semantic tree (choreography layers on top, without swapping tags)
<a className="skip-link" href="#conteudo">Skip to content</a>
<header>{/* main navigation <nav> lives here */}</header>
<main id="conteudo">
  <section aria-labelledby="hero-h1">
    <h1 id="hero-h1">A gestão que cabe na sua rotina</h1>
    {/* giant number 01 is DECORATIVE: aria-hidden span, never <h2> */}
    <span aria-hidden="true" className="sec-index">01</span>
  </section>
  <section aria-labelledby="features-h2">
    <h2 id="features-h2">Features</h2>
    <h3>Records</h3>{/* h2 → h3, never h2 → h4 */}
  </section>
</main>
<footer>{/* contentinfo */}</footer>
```

```css
/* Skip link: 1st focusable element in the body; off-screen until it receives focus. */
.skip-link { position: absolute; left: .5rem; top: -3rem; z-index: 100; padding: .5rem .75rem;
  background: var(--card); color: var(--fg); border-radius: .375rem; }
.skip-link:focus-visible { top: .5rem; outline: 2px solid var(--ac-t); outline-offset: 2px; }
/* appears instantly — focus doesn't animate (a11y > motion); zero motion numbers here */

/* 2.4.11 Focus Not Obscured: no scrollable target disappears under the sticky header */
[id] { scroll-margin-top: var(--header-h, 4.5rem); }
```

- A `<nav>` with no sibling like it doesn't need a label; two `<nav>`s on the page require a distinct `aria-label` on each ("Main", "Footer") — otherwise the screen reader lists "navigation, navigation".
- A section without a visible title still needs a name: `aria-labelledby` pointing to an `sr-only` heading, never an anonymous section.

### 2. Visible focus and focus order (static baseline)

Baseline focus for the whole page; animated surfaces (pin, hscroll, modal with `lenis.stop()`) are revalidated in `perf-a11y-motion`.

```css
/* Visible focus in both token scopes (dark .page and paper .light/.paperbox) */
:where(a, button, input, textarea, select, summary, [tabindex]):focus-visible {
  outline: 2px solid var(--ac-t); /* ≥ 3:1 against the adjacent background — 1.4.11 */
  outline-offset: 2px;
  border-radius: 2px;
}
```

- No positive `tabindex` — order follows the DOM, which must mirror visual order (2.4.3). If the layout visually reorders with CSS (grid/flex `order`), fix the DOM, don't force `tabindex`.
- `:focus-visible` (not `:focus`) so the ring doesn't draw on a mouse click; but never replace it with `outline: none` without an equal-contrast substitute.
- An element made focusable via `tabindex="0"` also needs its own role and keyboard behavior — if it needs that, it probably should be a `<button>` or a Radix primitive (Rule 2).

### 3. Interactive widgets with Radix — "no ARIA > wrong ARIA" in practice

Radix delivers role, `aria-modal`, focus trap, `Esc`, focus return, and the title/description binding AUTOMATICALLY. You style with `cva` and merge `className` with `cn()`; the ONLY ARIA you write is `aria-label` where there's no visible text.

```ts
// lib/cn.ts — canonical helper (shadcn pattern)
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge"; // v2.6.0: the 3.x series is for Tailwind v4 only; the project is v3.4
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
```

```tsx
"use client";
import { Dialog } from "radix-ui"; // single official package; @radix-ui/react-dialog is a valid alternative
import { cva } from "class-variance-authority";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

const content = cva(
  "fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[min(92vw,32rem)] " +
    "rounded-lg bg-[var(--card)] p-6 text-[var(--fg)] focus:outline-none"
);

export function ContactModal({ trigger, children }: { trigger: ReactNode; children: ReactNode }) {
  return (
    <Dialog.Root>
      {/* asChild merges the props (handlers, aria, ref) into YOUR <button> — keeps the semantic element */}
      <Dialog.Trigger asChild>{trigger}</Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/60" />
        <Dialog.Content className={cn(content())}>
          {/* Title/Description bind role="dialog" to aria-labelledby/aria-describedby on their own */}
          <Dialog.Title className="font-display text-xl">Talk to us</Dialog.Title>
          <Dialog.Description className="mt-2 text-sm opacity-80">We reply within 1 business day.</Dialog.Description>
          {children}
          {/* button WITHOUT visible text → aria-label goes here (the only manual ARIA) */}
          <Dialog.Close aria-label="Close" className="absolute right-4 top-4">✕</Dialog.Close>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
```

- `Tabs`, `DropdownMenu`, `NavigationMenu`, and `Accordion` already ship arrows + `Home`/`End` + roving tabindex; don't reimplement `onKeyDown`.
- Brand component with no primitive (hero, custom sections): use the correct native element and add only the ARIA that's missing. For YOUR component to accept `asChild`, use `Slot` from `@radix-ui/react-slot` — the same mechanism Radix uses.
- Entry/exit animation of the primitives (overlay, content) uses the tokens from `motion-foundation` (`DUR.micro`/`DUR.reveal`, `EASE.enter`) and honors reduced motion via `perf-a11y-motion` — never inline durations.

### 4. Accessible forms: react-hook-form + zod

Label associated via `htmlFor`; programmatic error (`aria-invalid` + `aria-describedby`) that is announced (`role="alert"`); same color+icon+text. `noValidate` hands validation to zod (consistent, announced messages, not native browser bubbles). The SAME zod schema runs on the server (Server Action / Front-end Architecture).

```tsx
"use client";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod"; // auto-detects Zod 3/4
import { z } from "zod";

const schema = z.object({
  email: z.string().email("Enter a valid email"),
  msg: z.string().min(10, "Minimum of 10 characters"),
});
type FormFields = z.infer<typeof schema>;

export function ContactForm() {
  const { register, handleSubmit, formState: { errors, isSubmitting } } =
    useForm<FormFields>({ resolver: zodResolver(schema) });

  return (
    <form noValidate onSubmit={handleSubmit(async () => { /* Server Action validates the SAME schema */ })}>
      <label htmlFor="email">Email</label>
      <input
        id="email"
        type="email"
        aria-invalid={errors.email ? true : undefined}      // attribute disappears when there's no error
        aria-describedby={errors.email ? "email-erro" : undefined}
        {...register("email")}
      />
      {errors.email && (
        <p id="email-erro" role="alert" className="text-[var(--err)]">
          <ErrorIcon aria-hidden="true" /> {errors.email.message} {/* icon + text: color isn't the only signal */}
        </p>
      )}
      <button type="submit" disabled={isSubmitting}>Send</button>
    </form>
  );
}
```

- `aria-invalid={true}` only when the error is present; `undefined` REMOVES the attribute (never a fixed `aria-invalid="false"`, which signals a field that was checked and valid).
- The "papelada" (paper-craft) palette has no error token: define `--err` in `papelada.css` and validate ≥ 4.5:1 in BOTH token scopes (dark `.page` and paper `.light`/`.paperbox`) — Technique 7 — never a nonexistent `var(--danger)`.
- A field with a permanent hint: `aria-describedby` can list two ids (hint + error), space-separated.
- Radio/checkbox group: `<fieldset>` + `<legend>` as the group's label (or Radix's `RadioGroup`, which already exposes `role="radiogroup"`).

### 5. Images, icons, and decoratives

```tsx
import Image from "next/image";

// Informative: alt describes the INFORMATION, not "image of..."
<Image src="/ficha.png" alt="Management record filled out with three completed tasks" width={1080} height={720} />

// Decorative: alt="" + aria-hidden — removed from the accessibility tree
<Image src="/textura.png" alt="" aria-hidden="true" width={1200} height={400} />
```

- Decorative SVG: `aria-hidden="true"` + `focusable="false"` (legacy IE/Edge still focuses SVG). SVG that IS the information: `role="img"` + `<title>`.
- Underlines/circles drawn by `rough-notation` (the "papelada" texture) are decorative: the generated `<svg>` carries `aria-hidden="true"`; the underlying text remains the real content.
- Purely aesthetic canvas/WebGL: `aria-hidden="true"` on the layer; if it carries information, provide an adjacent textual alternative (detail in `webgl-differentiator`). Matching `alt` with LCP/`priority` belongs to `perf-a11y-motion`.

### 6. Dynamic content: aria-live

The region must exist in the DOM BEFORE the message changes (empty → filled), otherwise the change isn't announced. Decision: `polite`/`status` for non-urgent updates (filter count, "saved"); `assertive`/`alert` for anything that interrupts (submit error).

```tsx
"use client";
export function LiveRegion({ message, assertive = false }: { message: string; assertive?: boolean }) {
  return (
    <p
      role={assertive ? "alert" : "status"}
      aria-live={assertive ? "assertive" : "polite"}
      className="sr-only" // visible to the screen reader, off the visual screen
    >
      {message}
    </p>
  );
}
```

- Toast: use Radix's `Toast` — it already sets up the correct live region; don't reinvent it.
- `.sr-only` is a clipping utility (not `display:none`, which removes it from the accessibility tree). Reuse the same one from Tailwind/`sr-only`.

### 7. Contrast and non-color: decide with a number

The bar: ≥ 4.5:1 normal text · ≥ 3:1 large text (≥ 24px or ≥ 18.66px bold) and UI components/focus. Calculate, don't estimate — the palette comes from the Design System (decided in `art-direction-anti-slop`); here it is PROVEN in both token scopes.

```ts
// lib/a11y/contrast.ts — relative luminance + WCAG 2.x ratio. Decide with a number, never "by eye".
function luminance(hex: string): number {
  const c = [1, 3, 5]
    .map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}
export function contrast(fg: string, bg: string): number {
  const [light, dark] = [luminance(fg), luminance(bg)].sort((a, b) => b - a);
  return (light + 0.05) / (dark + 0.05); // e.g.: contrast("#3E63A8", "#f5f1e8") — accent over paper
}
```

- Concrete non-color examples: error = icon + text + color; body link = underline (not color alone); active nav item = weight/underline + color; chart status = label/pattern beyond hue.
- Quick sanity test: render the screen in grayscale — if a status becomes ambiguous, it's missing a non-chromatic channel (1.4.1).
- Disabled state is exempt from text contrast, but everything else (focus, active UI border) is not — validate the accent on every surface (`.page`, `.light`, `.paperbox`).

### 8. Automated gate: @axe-core/playwright

`AxeBuilder` injects axe AUTOMATICALLY (no `injectAxe()`); it runs in the same Playwright harness as `motion-qa`. Axe only sees the CURRENT DOM — scan every meaningful state (default, open modal, form with error, open menu).

```ts
// e2e/a11y.spec.ts
import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright"; // v4.12.1 (lockstep with axe-core)

const TAGS = ["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]; // 2.2 AA = superset of the earlier ones

test("home: zero violations in page scope", async ({ page }) => {
  await page.goto("/");
  const r = await new AxeBuilder({ page }).withTags(TAGS).include(".page").analyze();
  expect(r.violations).toEqual([]); // any violation fails the build
});

test("open modal: zero violations", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Talk to us" }).click(); // OPEN before analyzing
  const r = await new AxeBuilder({ page }).withTags(TAGS).analyze();
  expect(r.violations).toEqual([]);
});

test("form with error: zero violations", async ({ page }) => {
  await page.goto("/contato");
  await page.getByRole("button", { name: "Send" }).click(); // triggers the zod errors
  const r = await new AxeBuilder({ page }).withTags(TAGS).analyze();
  expect(r.violations).toEqual([]);
});
```

- `.include(sel)` / `.exclude(sel)` to scope (e.g.: run on `.page` and then on a `.light` container) or to drop a third-party embed you don't control.
- `disableRules([...])` ONLY for a documented third-party exception in the A11y Report — never to force a green result on your own markup (that hides the defect).
- Axe covers a FRACTION of WCAG (automatable checks, ~30–57%): green on axe is a necessary, not sufficient, condition — the manual pass (Technique 9) is mandatory.

### 9. Manual pass + A11y Report (what axe doesn't catch)

Four manual passes, with evidence:

- **Keyboard:** `Tab` from top to footer — skip link first, focus always visible and never trapped; `Esc` closes the modal and returns focus to the trigger; arrows navigate menu/tabs/accordion; focus order = reading order.
- **Screen reader:** VoiceOver (Safari/macOS) or NVDA (Firefox/Windows) — navigable landmarks, a single `<h1>`, headings in order, `alt`/labels make sense read aloud, errors announced via `aria-live`.
- **Zoom/reflow:** 400% with no horizontal scroll or content loss (1.4.10); text at 200% with no clipping (1.4.4).
- **Non-color:** screen in grayscale — every status still distinguishable (1.4.1).

The **A11y Report** is the `{route/state × axe(0) × keyboard × screen reader × zoom × non-color}` matrix with attached evidence (axe output per state, video of the keyboard walk in the `motion-qa` pattern), the list of exceptions (justified `disableRules`), and open defects. It feeds the QA Report; the Producer re-verifies the items in the Release Checklist.

## Libraries and plugins

| Package | Version | Install | When to use |
|---|---|---|---|
| `radix-ui` | 1.6.1 (`^1.6`) | `npm install radix-ui` | Every interactive widget (Dialog, DropdownMenu, Tabs, Accordion, Popover, Tooltip, Select, Switch, Toast) — ships WAI-ARIA + focus + keyboard ready-made. |
| `@radix-ui/react-slot` | 1.3.0 (`^1.3`) | `npm install @radix-ui/react-slot` | Implement `asChild` in YOUR brand component (with no primitive), preserving the semantic element. |
| `class-variance-authority` | 0.7.1 | `npm install class-variance-authority` | Generate the Radix widgets' style variants (1.0 is in beta — pin 0.7.1). |
| `tailwind-merge` | 2.6.0 (`^2.6`) | `npm install tailwind-merge@^2.6` | `cn()` — dedupes conflicting utilities. **v2.6 because the project is Tailwind v3.4; the 3.x series is for Tailwind v4 only.** |
| `clsx` | 2.1.1 | `npm install clsx` | `cn()` — composes conditional classes before the merge. |
| `react-hook-form` | 7.76.0 (`^7.76`) | `npm install react-hook-form` | Accessible forms (uncontrolled, few re-renders); `formState.errors` feeds `aria-invalid`/`aria-describedby`. |
| `zod` | 4.x (`^4`) | `npm install zod` | Typed validation schema; the error message is the text announced by `role="alert"`. |
| `@hookform/resolvers` | 5.4.0 (`^5.4`) | `npm install @hookform/resolvers` | `zodResolver` bridges zod to RHF (auto-detects Zod 3/4). |
| `@axe-core/playwright` | 4.12.1 (`^4.12`) | `npm install -D @axe-core/playwright` | Automated WCAG 2.2 AA gate in CI (`AxeBuilder`, automatic injection). |

The `@playwright/test` runner and the harness config come from `motion-qa` — this skill only bolts `@axe-core/playwright` on top. `next` (`^15.5`) is the base of the project: `next/image` handles `alt` (the LCP/`priority` side belongs to `perf-a11y-motion`). The individual `@radix-ui/react-*` packages are a maintained alternative to the `radix-ui` meta-package — pick one model and don't mix versions.

## Anti-patterns

- **`<div onClick>` as a button** → doesn't receive focus, doesn't fire on `Enter`/`Space`, invisible to the screen reader; use `<button>`.
- **Dropdown/modal/tabs reimplemented by hand** → missing roving tabindex, `Esc`, and focus return; fails axe and the keyboard walk. Use Radix.
- **ARIA "just in case"** (`role="button"` on a `<button>`, `aria-label` duplicating the visible text) → the screen reader reads it doubled/wrong; worse than no ARIA.
- **Multiple `<h1>`s or skipping `h1`→`h3`** → broken heading index; `H`-key navigation gets disoriented.
- **`outline: none` with no substitute** → keyboard users navigate blind (violates 2.4.7).
- **Positive `tabindex`** (`tabindex="3"`) → an impossible-to-maintain parallel focus order inconsistent with reading order.
- **Placeholder instead of `<label>`** → disappears while typing and isn't read as the field's name.
- **Form error shown only in red** (no text, no `aria-invalid`) → invisible to colorblind users and to the screen reader.
- **Fixed `aria-invalid="false"` on the input** → constantly announces "valid, checked"; leave the attribute absent until there's an error.
- **Missing `alt`** → the screen reader reads the filename; **decorative without `alt=""`** → noise that pollutes the reading.
- **Icon-only without `aria-label`** (close, hamburger) → a "button" with no accessible name.
- **Touch target < 24px with no spacing** → fails 2.5.8; mobile mis-taps.
- **Focused field behind the sticky header** → violates 2.4.11; missing `scroll-margin-top` ≥ header height.
- **Toast/validation without `aria-live`** (or a live region created TOGETHER with the message) → silent change for anyone who can't see the screen.
- **`disableRules(['color-contrast'])` to pass axe** → false green; hides the defect instead of fixing the palette.
- **Status by color alone** (green/red) → violates 1.4.1; ~8% of men can't distinguish them.
- **Relying only on axe and skipping the manual walk** → ~30–57% coverage; context, focus order, and `alt`/label quality slip through.

## Approval checklist

Answer yes/no. Any "no" blocks the handoff to `a11y-auditor`; `producer-orquestrador` re-verifies the items in the Release Checklist, and the evidence for all of this is the A11y Report.

- [ ] Real landmarks (`<header> <nav> <main> <footer>`), a single `<h1>`, and a heading hierarchy with no skipped levels?
- [ ] Skip link is the 1st focusable element and leads to `<main id>`; duplicate `<nav>`s have distinct `aria-label`s?
- [ ] Every interactive widget comes from Radix (styled by `cva`+`cn()`), with no hand-reimplemented `onKeyDown`/ARIA?
- [ ] Zero redundant ARIA — `aria-*` only where native/Radix doesn't cover it (e.g., `aria-label` on an icon-only button)?
- [ ] Visible focus via `:focus-visible` (≥ 3:1) on every interactive element, in both token scopes; no `outline: none` without a substitute?
- [ ] Focus order = reading order, with no positive `tabindex` and no keyboard trap; arrows/`Esc`/`Home`/`End` work in menus?
- [ ] No focused component is covered by a sticky header/cookie banner (2.4.11 — `scroll-margin-top` applied)?
- [ ] Pointer targets ≥ 24×24px (or with spacing) — 2.5.8?
- [ ] Contrast ≥ 4.5:1 (text) / ≥ 3:1 (large text and UI/focus) calculated with a number in both scopes, blue accent included?
- [ ] No information depends on color alone (error/link/active state with text+icon+shape); passes the grayscale test?
- [ ] Every field has an associated `<label>`; errors with `aria-invalid` + `aria-describedby` + `role="alert"`, and the same zod schema runs on the server?
- [ ] Every image has `alt` (meaningful or `alt=""`); decorative SVG/canvas/`rough-notation` with `aria-hidden`?
- [ ] Dynamic content (toast, count, validation) announced by a live region that already existed in the DOM before the change?
- [ ] Reduced motion, focus not trapped by scroll/pin, and flashing delegated to `perf-a11y-motion` (no duplication, no gap)?
- [ ] `@axe-core/playwright` with tags `wcag2a/2aa/21aa/22aa` returns `violations: []` in every state (default, open modal, form with error, open menu)?
- [ ] Manual pass done (keyboard + screen reader + 400% zoom + grayscale) and the A11y Report consolidated, with exceptions (`disableRules`) justified?
