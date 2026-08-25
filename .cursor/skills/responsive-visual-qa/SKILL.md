---
name: responsive-visual-qa
description: Visual and responsive QA with Playwright — fidelity to the Design System/Art Direction Spec and layout integrity (zero overflow, touch targets, images, fluid typography) across the 360→1920 × light/dark matrix, edge states, and safe areas; produces the Design QA Report. Use when reviewing any layout or screen before release.
---

# Visual & Responsive QA

## Purpose

An approved mock on one screen is a promise; the LP is whatever survives of it at 360px, at 1920px, in the theme you looked at least, and in the state nobody opens (empty, error). This skill is the page's **spatial** QA: fidelity to the **Design System** (`design-system`) and to the **Art Direction Spec** (the detailed Creative Direction from `art-direction-anti-slop`), plus the integrity of the responsive layout (implemented by `responsive`) across the entire breakpoint matrix, both themes, and edge states. Explicit, non-overlapping boundary: **temporal** QA (jank, FPS, easing, and runtime CLS) belongs to `motion-qa`; **semantic** accessibility (markup, ARIA, screen reader) belongs to `accessibility-wcag`; here we validate the **static frame once it has settled** — token drift, horizontal scroll, undersized targets, distorted images, ugly text breaks. It's executed by the Visual QA (`design-qa-visual`) in the same Playwright harness as the other two; it produces the **Design QA Report**, whose findings go back to the UI Engineer (`ui-engineer`) when they're an implementation deviation, and to the Art Director (`diretor-de-arte`) when the art spec itself diverges; the Producer (`producer-orquestrador`) re-verifies it in the Release Checklist. A screenshot is the evidence — but only once the motion has frozen.

## Golden rules

None of the rules below can be relaxed. Violations fail the QA Report.

1. **A screenshot is the evidence — but only once the page has settled, never mid-reveal.** Visual regression runs with motion frozen (reveals in their final state via `?reduced=1`). *Why:* GSAP runs in JS; Playwright's `animations: 'disabled'` only freezes CSS — a half-way still fails on a temporal difference, not a spatial one, and the diff turns into noise nobody trusts.
2. **Mandatory matrix: 360, 390, 768, 1024, 1440, 1920 × light/dark.** Each viewport straddles a `design-system` breakpoint (`sm 640 · md 768 · lg 1024 · xl 1280`); skipping one is a blind spot. *Why:* layout bugs live exactly on the breakpoint edge and in the least-tested theme — and they only surface on the client's device.
3. **Zero horizontal scroll at any viewport: `scrollWidth ≤ clientWidth + 1px`.** *Why:* horizontal overflow is mobile defect #1; a single element with a fixed width larger than the viewport breaks the entire page and screams amateur.
4. **Touch target ≥ 44px on touch viewports; hard floor 24×24 CSS px (WCAG 2.2 §2.5.8 AA), exempt only with ≥ 24px spacing.** *Why:* 24 is the legal AA minimum, 44 is real finger comfort (2.5.5 is AAA, not required); below 44 on mobile the user misses the tap.
5. **Image never distorted: rendered aspect ratio = natural (deviation ≤ 1%).** *Why:* stretching/squashing a photo with `width`/`height` and no `object-fit` screams broken template — and the eye's pattern-matcher catches it instantly.
6. **Divergence from the Design System or the Art Direction Spec is a FINDING, not a matter of taste.** Color outside the token palette, radius outside `{6,8,10,12,999}`, spacing outside the 4/8pt grid, font outside the `display/text/mono` roles, gutter outside the token. *Why:* fidelity is verifiable as a number against the token; "I thought it looked good" is not an approval criterion.
7. **Fluid typography can't shrink below the floor or overflow the container.** Body text ≥ 14px effective at the smallest viewport; no text block with `scrollWidth > clientWidth`; long tokens (URL/email) must always be breakable. *Why:* a poorly calibrated `clamp()` either turns illegible at 360px or busts the box at 1920px.
8. **CLS (runtime shift) is a `motion-qa` gate; here we validate the static frame once it has settled.** *Why:* the boundary avoids both a gap and double-checking — this QA is spatial (is the resting layout correct?), that one is temporal (did the layout move while loading?).
9. **No hover/focus/press state reflows the layout.** Only `transform`/`filter`/color change; the neighbor doesn't move a pixel. *Why:* hover that pushes surrounding elements is jitter and betrays a fragile layout (mirrors `perf-a11y-motion` and `design-system`).
10. **Visible focus is never clipped by an ancestor's `overflow: hidden`.** The ring (`outline` + `offset` 3px) must fit entirely. *Why:* a cropped ring is invisible focus in practice — it fails a11y on the spatial plane, where axe doesn't reach.
11. **Empty and error are first-class states, tested with their own screenshot.** *Why:* most layout bugs show up when the list is empty or validation fills the screen — the happy path hides exactly that.
12. **A fixed/sticky element on an edge respects `env(safe-area-inset-*)` + `viewport-fit=cover`.** *Why:* without it, the fixed CTA disappears behind the iPhone notch/home indicator — conversion lost right at the fold.
13. **QA reports, it doesn't fix.** Implementation deviation goes back to `ui-engineer`; divergence in the Art Direction Spec itself goes to `diretor-de-arte`. *Why:* mixing roles hides the very regression the canonical flow exists to expose.

## Techniques

### 1. Environment and project matrix (viewport × theme)

One Playwright project per viewport; the theme is injected via `colorScheme` + `localStorage` seeding (the `design-system` head script's contract). Chromium is the harness's canonical browser (shared with `motion-qa`/`accessibility-wcag`). The six viewports straddle the token breakpoints — ALSO test `breakpoint - 1px` (639/767/1023/1279), where the layout switches branch.

```ts
// qa/visual.config.ts — inherits the baseURL/harness from motion-qa; only swaps testDir + viewport matrix
import { defineConfig } from '@playwright/test';

const VIEWPORTS = [
  { name: 'w360',  width: 360,  height: 780  }, // small Android — the real mobile floor (below sm 640)
  { name: 'w390',  width: 390,  height: 844  }, // modern iPhone (same viewport as motion-qa)
  { name: 'w768',  width: 768,  height: 1024 }, // portrait tablet = exact md breakpoint
  { name: 'w1024', width: 1024, height: 1366 }, // exact lg breakpoint / landscape tablet
  { name: 'w1440', width: 1440, height: 900  }, // common desktop (same as motion-qa)
  { name: 'w1920', width: 1920, height: 1080 }, // large desktop — the LP's width ceiling
] as const;

export default defineConfig({
  testDir: './qa/visual',
  // baseline versioned per project; without {platform} the diff breaks between the dev's macOS and CI's Linux — pin ONE baseline environment (CI)
  snapshotPathTemplate: '{testDir}/__screenshots__/{projectName}/{arg}{ext}',
  expect: { toHaveScreenshot: { maxDiffPixelRatio: 0.01, animations: 'disabled' } },
  use: { baseURL: process.env.QA_URL ?? 'http://localhost:3000', browserName: 'chromium' },
  projects: VIEWPORTS.map((v) => ({
    name: v.name,
    use: {
      viewport: { width: v.width, height: v.height },
      isMobile: v.width <= 768,          // Chromium-only — enables metaviewport/touch in the layout engine
      hasTouch: v.width <= 768,
      deviceScaleFactor: 2,              // retina: catches image blur and hairlines disappearing at @2x
    },
  })),
});
```

Theme is deterministic via seeding BEFORE navigation — the `design-system` head script reads `localStorage.theme` and stamps `data-theme` on the 1st paint (no FOUC). On the real LP (scope `.page` + `.light`/`.paperbox`), drive the class through the same seam. Never rely on `colorScheme` alone: with an empty `localStorage`, the head script falls back and you'll screenshot the wrong theme.

```ts
// qa/visual/theme.ts
import type { BrowserContext } from '@playwright/test';
export async function seedTheme(context: BrowserContext, theme: 'light' | 'dark'): Promise<void> {
  await context.addInitScript((t) => {
    try { localStorage.setItem('theme', t); } catch { /* storage blocked: the prefers-color-scheme fallback below covers the theme */ }
  }, theme);
}
```

### 2. Deterministic visual regression: `toHaveScreenshot`

The still is only trustworthy with motion in its final state. Load with `?reduced=1` (the `perf-a11y-motion`/`motion-qa` seam: content 100% visible, nothing at `opacity:0`, no entrance transform) and **mask** non-deterministic surfaces (WebGL, video, counters) — otherwise the diff stays eternally red from frame noise.

```ts
// qa/visual/regression.spec.ts
import { test, expect } from '@playwright/test';
import { seedTheme } from './theme';

for (const theme of ['light', 'dark'] as const) {
  test(`home has no regression — ${theme}`, async ({ page, context }) => {
    await seedTheme(context, theme);
    await page.emulateMedia({ colorScheme: theme }); // matches prefers-color-scheme to the intended theme → the head script's fallback (storage blocked) won't screenshot the wrong theme
    await page.goto('/?reduced=1');                 // reveals in their final state → deterministic static frame
    await page.waitForLoadState('networkidle');
    await page.evaluate(() => document.fonts.ready); // without this the diff picks up the FOUT from next/font's adjusted fallback
    await expect(page).toHaveScreenshot(`home-${theme}.png`, {
      fullPage: true,
      animations: 'disabled',                        // freezes CSS transitions; ?reduced=1 already neutralizes GSAP
      mask: [page.locator('canvas, video, [data-qa-dynamic]')], // WebGL/video/counter out of the diff
      maxDiffPixelRatio: 0.01,                        // ~1% tolerates subpixel antialiasing, fails a real layout change
    });
  });
}
```

The filename carries the theme; `projectName` (viewport) is already part of the snapshot path — so the matrix becomes `6 viewports × 2 themes = 12` baselines per route. Updating a baseline is a deliberate act (`--update-snapshots`) with diff review in the Design QA Report: an auto-updated baseline hides the very regression it's supposed to catch.

### 3. Horizontal scroll: hunting the culprit element

Stating "there's overflow" isn't enough — the finding needs the culprit's selector. Report only the rightmost leaves (sorted), not the chain of parents.

```ts
// qa/visual/helpers.ts
import type { Page } from '@playwright/test';

export interface Overflow { sel: string; right: number; width: number }

export async function findHorizontalOverflow(page: Page): Promise<Overflow[]> {
  return page.evaluate(() => {
    const vw = document.documentElement.clientWidth;
    const bad: { sel: string; right: number; width: number }[] = [];
    const label = (el: Element): string => {
      const cls = typeof el.className === 'string' && el.className.trim()
        ? '.' + el.className.trim().split(/\s+/).slice(0, 3).join('.') : '';
      return `${el.tagName.toLowerCase()}${el.id ? '#' + el.id : ''}${cls}`.slice(0, 80);
    };
    document.querySelectorAll<HTMLElement>('body *').forEach((el) => {
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) return;          // ignores collapsed elements
      if (r.right > vw + 1 || r.left < -1) bad.push({ sel: label(el), right: Math.round(r.right), width: Math.round(r.width) });
    });
    return bad.sort((a, b) => b.right - a.right).slice(0, 15);
  });
}

export async function documentOverflows(page: Page): Promise<boolean> {
  return page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
}
```

```ts
test('no horizontal scroll', async ({ page }, info) => {
  await page.goto('/?reduced=1');
  await page.waitForLoadState('networkidle');
  const offenders = await findHorizontalOverflow(page);
  expect(offenders, `elements breaking out of the viewport at ${info.project.name}:\n${JSON.stringify(offenders, null, 2)}`).toEqual([]);
});
```

`overflow-x: hidden` on `body` is NOT a fix — it only hides the scrollbar; the wide element keeps pushing the layout and breaking internal scroll. The finding is the element, not the bar.

### 4. Fluid typography: no ugly breaks, no clipping, with a floor

Three numeric checks: (a) no text block has `scrollWidth > clientWidth` (horizontal clipping that isn't intentional `ellipsis`); (b) body text doesn't drop below 14px effective at 360px — sample `parseFloat(getComputedStyle(el).fontSize)` on `p`/`li` and fail `< 14`; (c) prose containers break long tokens.

```ts
export async function findTextOverflow(page: Page): Promise<{ sel: string; over: number }[]> {
  return page.evaluate(() => {
    const bad: { sel: string; over: number }[] = [];
    document.querySelectorAll<HTMLElement>('h1,h2,h3,h4,h5,h6,p,li,a,span,button,label,figcaption').forEach((el) => {
      if (!el.textContent?.trim()) return;
      const cs = getComputedStyle(el);
      if (/(auto|scroll)/.test(cs.overflowX)) return;                       // intentional scroller
      if (cs.textOverflow === 'ellipsis' || cs.whiteSpace === 'nowrap') return; // intentional truncation
      if (el.scrollWidth > el.clientWidth + 1) bad.push({ sel: el.tagName.toLowerCase() + (el.id ? '#' + el.id : ''), over: el.scrollWidth - el.clientWidth });
    });
    return bad.slice(0, 20);
  });
}
```

A long token that doesn't break is disguised overflow: containers that may receive a URL/email/code need `overflow-wrap: anywhere` (or `hyphens: auto` with `lang`). Clipping on uppercase display text (Anton, `line-height < 1`) with a SplitText mask is a separate case — the mask is released on `onComplete` (the `art-direction-anti-slop` contract); in the still with `?reduced=1` the text is already in its final state, so any remaining clipping here IS a finding.

### 5. Touch targets: floor 24 (AA) / target 44 + spacing exception

Measure the **rendered bounding box**, never the declared class (`h-11`): padding, `transform: scale`, and `line-height` change the real target. The 2.5.8 exception exempts a target < 24 only if there is ≥ 24px of spacing to the neighbor.

```ts
export interface Target { sel: string; w: number; h: number; gap: number }

export async function auditTargets(page: Page): Promise<Target[]> {
  return page.evaluate(() => {
    const sel = 'a[href],button,input:not([type=hidden]),select,textarea,[role="button"],[role="link"],[role="tab"],[role="switch"]';
    const els = [...document.querySelectorAll<HTMLElement>(sel)];
    const boxes = els.map((el) => ({ el, r: el.getBoundingClientRect() })).filter((b) => b.r.width > 0 && b.r.height > 0);
    const out: Target[] = [];
    for (const { el, r } of boxes) {
      const min = Math.min(r.width, r.height);
      if (min >= 44) continue;                                     // hits the comfort target
      let gap = Infinity;                                          // smallest edge-to-edge distance to another target
      for (const o of boxes) {
        if (o.el === el) continue;
        const dx = Math.max(0, o.r.left - r.right, r.left - o.r.right);
        const dy = Math.max(0, o.r.top - r.bottom, r.top - o.r.bottom);
        gap = Math.min(gap, Math.hypot(dx, dy));
      }
      out.push({ sel: (el.id ? '#' + el.id : el.tagName.toLowerCase()) + '·' + (el.textContent?.trim().slice(0, 16) ?? ''), w: Math.round(r.width), h: Math.round(r.height), gap: Math.round(gap) });
    }
    return out;
  });
}
```

```ts
test('touch targets', async ({ page }, info) => {
  test.skip(!/w360|w390|w768/.test(info.project.name), 'touch target check only on touch viewports');
  await page.goto('/?reduced=1');
  const below = await auditTargets(page);
  const hardFail = below.filter((b) => Math.min(b.w, b.h) < 24 && b.gap < 24); // fails 2.5.8 AA
  expect(hardFail, `targets < 24px without spacing:\n${JSON.stringify(hardFail, null, 2)}`).toEqual([]);
  if (below.length) info.attach('targets-24-to-44', { body: JSON.stringify(below, null, 2), contentType: 'application/json' }); // 24–44 = comfort finding, doesn't fail the gate
});
```

The 24px floor and the 2.5.8 a11y gate are shared with `accessibility-wcag` (which runs `@axe-core/playwright`); here the reading is geometric and per touch viewport, covering what axe doesn't measure under mobile emulation.

### 6. Images without distortion

Compare the rendered aspect to the natural one. `object-fit: cover/contain/scale-down` protects the ratio — it's only distortion when the box forces a different aspect without a fit.

```ts
export async function findDistortedImages(page: Page, tol = 0.01): Promise<{ src: string; render: number; natural: number }[]> {
  return page.evaluate((t) => {
    const bad: { src: string; render: number; natural: number }[] = [];
    document.querySelectorAll('img').forEach((img) => {
      if (!img.complete || img.naturalWidth === 0) return;
      const r = img.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) return;
      const fit = getComputedStyle(img).objectFit;
      if (fit !== 'fill') return; // only the default `fill` distorts; cover/contain/scale-down/none preserve the aspect
      const render = r.width / r.height, natural = img.naturalWidth / img.naturalHeight;
      if (Math.abs(render / natural - 1) > t) bad.push({ src: (img.currentSrc.split('/').pop() ?? '').slice(0, 40), render: +render.toFixed(3), natural: +natural.toFixed(3) });
    });
    return bad;
  }, tol);
}
```

`next/image` with `fill` requires an explicit `object-cover`/`object-contain` and a sized `relative` parent — without it, it distorts or leaks. Also check that `sizes` is coherent with the rendered width (the weight/LCP side belongs to `perf-a11y-motion`/`asset-pipeline`; here it's just geometry).

### 7. Fidelity: token conformance vs. Design System + Art Direction Spec

Fidelity is measurable: every painted value must trace back to a token. **Radius** is the cleanest check — the legal set is closed (`control 6 · field 8 · surface 10 · window 12 · pill 999`), and a stray `5px`/`7px`/`16px` is drift signal #1.

```ts
export async function checkRadiusConformance(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const bad = new Set<string>();
    document.querySelectorAll<HTMLElement>('body *').forEach((el) => {
      const cs = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      for (const corner of [cs.borderTopLeftRadius, cs.borderBottomRightRadius]) {
        const px = parseFloat(corner);
        if (!corner.endsWith('px') || Number.isNaN(px) || px === 0) continue;
        if (px >= Math.min(r.width, r.height) / 2 - 1) continue;    // pill (999) resolves to half the smallest dimension
        if (![6, 8, 10, 12].includes(Math.round(px))) bad.add(`${el.tagName.toLowerCase()}: ${Math.round(px)}px`);
      }
    });
    return [...bad].slice(0, 20);
  });
}
```

**Color:** resolve each semantic var through a probe element into a concrete `rgb()` (`--ink`/`--surface`/`--accent`/states), collect the opaque colors in use, and diff — any opaque text/background/border color outside the resolved set is a finding (alpha blends expand the set; the gate is on the opaque ones). **Spacing/grid:** sample `padding`/`gap` on section containers and require multiples of 4px; the section gutter must match the token (`spacing.gutter = 7vw`, `spacing.section = clamp(88px,13vh,150px)`). **Typography:** the computed `font-family` must resolve to one of the `display/text/mono` roles; `font-size` must sit on the `tailwind.config`'s `fontSize` scale. Color/radius/spacing/gutter divergence goes back to `ui-engineer`; if the Art Direction Spec itself asks for a value outside the system, the finding belongs to the spec and goes back to `diretor-de-arte`.

### 8. Spatial states: hover without reflow, unclipped focus, empty/error

**Hover** (fine pointer only) changes `transform`/`filter`/color — never the neighbor's box:

```ts
test('hover does not reflow (desktop)', async ({ page }, info) => {
  test.skip(/w360|w390|w768/.test(info.project.name), 'hover only on fine pointer');
  await page.goto('/?reduced=1');
  const cta = page.getByRole('link', { name: /começar|assinar|contato/i }).first(); // adjust to the real selector
  const neighbor = page.locator('nav a').nth(1);
  const before = await neighbor.boundingBox();
  await cta.hover();
  await page.waitForTimeout(350);            // micro-transition (token 0.2–0.4s) settles before remeasuring
  const after = await neighbor.boundingBox();
  expect(after, 'CTA neighbor moved on hover — reflow forbidden').toEqual(before);
});
```

**Unclipped focus:** the ring, inflated by `outline-width + outline-offset`, must fit within every ancestor that clips (`overflow: hidden/clip`). The authoritative pass is keyboard-driven (`page.keyboard.press('Tab')`) to trigger real `:focus-visible`.

```ts
export async function findClippedFocus(page: Page, maxTabs = 60): Promise<string[]> {
  const bad = new Set<string>();
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  for (let i = 0; i < maxTabs; i++) {
    await page.keyboard.press('Tab');   // REAL keyboard focus → triggers :focus-visible on a[href]/button (programmatic .focus() does NOT paint the ring on them)
    const hit = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement | null;
      if (!el || el === document.body) return null;
      const cs = getComputedStyle(el);
      const inflate = (parseFloat(cs.outlineWidth) || 0) + (parseFloat(cs.outlineOffset) || 0);
      if (inflate === 0) return null;   // only fails when the :focus-visible ring was actually painted
      const r = el.getBoundingClientRect();
      const ring = { l: r.left - inflate, t: r.top - inflate, right: r.right + inflate, b: r.bottom + inflate };
      for (let p = el.parentElement; p; p = p.parentElement) {
        const pcs = getComputedStyle(p);
        if (!/(hidden|clip)/.test(pcs.overflow + pcs.overflowX + pcs.overflowY)) continue;
        const pr = p.getBoundingClientRect();
        if (ring.l < pr.left - 1 || ring.right > pr.right + 1 || ring.t < pr.top - 1 || ring.b > pr.bottom + 1)
          return `${el.id ? '#' + el.id : el.tagName.toLowerCase()} clipped by ${p.tagName.toLowerCase()}`;
      }
      return null;
    });
    if (hit) bad.add(hit);
  }
  return [...bad].slice(0, 20);
}
```

**Empty and error** are their own screenshots, not footnotes: drive the seam (`?state=empty`, or submit the empty form so zod's errors fill the screen) and run the same battery (overflow + regression) on these states. This is where the layout breaks in production.

### 9. Mobile orientation and safe areas

Mobile landscape (844×390) reruns the overflow check and verifies that the `sticky-cta` (`z-sticky-cta` from `design-system`) doesn't cover content or the footer:

```ts
test('mobile landscape: no overflow, CTA does not cover content', async ({ page }) => {
  await page.setViewportSize({ width: 844, height: 390 });
  await page.goto('/?reduced=1');
  expect(await documentOverflows(page)).toBe(false);
  const footer = page.locator('footer');
  await footer.scrollIntoViewIfNeeded();
  const cta = page.locator('[data-qa="sticky-cta"]');
  if (await cta.count()) {
    const [c, f] = [await cta.boundingBox(), await footer.boundingBox()];
    expect(c && f && c.y >= f.y + f.height - 1, 'sticky-cta overlaps the footer in landscape').toBeTruthy();
  }
});
```

**Safe area** can't be synthesized by Playwright's viewport — `env(safe-area-inset-*)` resolves to 0 outside a real device. The gate is the **code contract**, which is verifiable: (1) Next's `viewport` declares `viewportFit: 'cover'`; (2) every edge-touching `position: fixed`/`sticky` references the inset. Without both, the CTA disappears behind the home indicator.

```ts
// app/layout.tsx — enables the notch area (without this env(safe-area-inset-*) stays 0 on iOS)
import type { Viewport } from 'next';
export const viewport: Viewport = { viewportFit: 'cover', themeColor: '#0F0E0C' };
```

```css
/* Fixed CTA respecting the home indicator — max() guarantees the base padding when the inset is 0 */
.sticky-cta { position: fixed; inset-inline: 0; bottom: 0;
  padding-bottom: max(1rem, env(safe-area-inset-bottom)); }
```

### 10. Design QA Report (mandatory template, filled fields)

```markdown
# Design QA Report — <project> — <date> — commit <sha>
## Verdict: APPROVED | REJECTED

## Matrix (6 viewports × 2 themes — status per cell)
| Viewport | Overflow-X | Targets | Distortion | Text | Regression (diff%) | light | dark |
|----------|-----------|-------|-----------|-------|-------------------|-------|------|
| 360×780  |           |       |           |       |                   |       |      |
| 390×844  |  … 768 · 1024 · 1440 · 1920 …                                        |       |      |

## Evidence
- Stills: qa/visual/__screenshots__/<project>/home-{light,dark}.png (12 baselines)
- Contact sheet: qa/deliverables/breakpoints.png · Regression diffs: test-results/**/*-diff.png

## Fidelity (divergence = finding; route: `ui-engineer` impl · `diretor-de-arte` art spec)
| Token | Expected | Found | Element | Route |
|-------|----------|-----------|----------|------|
| radius  | {6,8,10,12,999} |    |          |      |
| color · spacing(4/8) · gutter(7vw) · font(display/text/mono) …                     |

## Findings by viewport (selector + measurement + evidence)
- <viewport> — <culprit selector> — <measurement: right/vw · target w×h · aspect deviation> — <still/diff>

## Edge states
- Hover reflows? [ ] · Focus clipped? [ ] · Empty tested? [ ] · Error tested? [ ]
- Landscape without overflow? [ ] · viewport-fit=cover + env() on fixed elements? [ ]
```

`sharp` assembles the stills' contact sheet into a single attachable PNG. The Design QA Report feeds the QA Report (alongside the A11y Report from `accessibility-wcag` and the metrics from `motion-qa`); the Producer re-verifies it in the Release Checklist.

## Libraries and plugins

| Package | Version | Install | When to use |
|---|---|---|---|
| `@playwright/test` | `1.61.1` | `npm i -D @playwright/test@1.61.1 && npx playwright install chromium` | Runner: per-viewport projects, `toHaveScreenshot` (diff via built-in `pixelmatch`), `isMobile`/`hasTouch`/DSR emulation, `getBoundingClientRect` via `evaluate`. Config inherited from `motion-qa`. |
| `sharp` | `^0.35.3` | `npm i -D sharp` | OPTIONAL — assembles the contact sheet (stills laid out by breakpoint) attached to the Design QA Report. Already in the stack (asset build). |

`@axe-core/playwright` (`4.12.1`) covers the a11y overlaps (2.5.8 target, focus) and belongs to `accessibility-wcag` — **do not reinstall it here**. `pixelmatch` already ships bundled with `@playwright/test` (never install it separately). `next` (`^15.5`) provides the `viewport.viewportFit = 'cover'` for safe areas. No third-party "visual regression" toolkit (Percy/Chromatic/BackstopJS): the native, baseline-in-repo `toHaveScreenshot` is enough and adds no external service.

## Anti-patterns

- **Screenshot mid-reveal (without `?reduced=1`)** → diff always red from a temporal difference; regression turns into noise and the team disables the gate.
- **`animations: 'disabled'` as if it froze GSAP** → JS-driven reveals stay mid-way; a flaky baseline that fails randomly.
- **Comparing a still with `canvas`/`video` and no `mask`** → an eternal diff from WebGL/video-frame noise, with no real bug.
- **Testing only 1440 (the dev's screen)** → 360px overflow and 768 breakage sail through until the client opens it on a phone.
- **`overflow-x: hidden` on `body` as an overflow "fix"** → hides the scrollbar; the wide element keeps pushing the layout and killing internal scroll.
- **Measuring a target by its declared class (`h-11`), not the rect** → padding/`scale`/`line-height` change the real target; always use `getBoundingClientRect`.
- **Image with `width/height` and no `object-fit`** → silent distortion whenever the aspect differs from natural; `next/image fill` without `object-cover` leaks.
- **"It looks close to the mock" without checking the token** → color/radius/spacing drift accumulates and the page loses the system (radius `7px`, gray outside the palette).
- **Ignoring dark (or screenshotting only dark)** → the least-looked-at theme always has broken contrast and the wrong surface.
- **Only the happy path (full list, no error)** → empty and error blow up the layout exactly in production, where nobody tested.
- **Fixed CTA without `env(safe-area-inset-*)` / `viewport-fit=cover`** → disappears behind the iPhone home indicator; conversion lost at the fold.
- **Focus with `outline-offset` inside `overflow: hidden`** → clipped ring, invisible keyboard focus — fails spatially where axe doesn't catch it.
- **Auto-updated baseline** → `--update-snapshots` without reviewing the diff stamps the regression as if it were the new truth.
- **QA editing the code to make the still pass** → hidden regression; the finding must go back to `ui-engineer` (impl) or `diretor-de-arte` (art spec).

## Approval checklist

Answer yes/no. Any "no" blocks the handoff to the QA Report (`head-of-quality`); the Producer (`producer-orquestrador`) re-verifies it in the Release Checklist, and the evidence for all of this is the Design QA Report.

- [ ] Full matrix run: 360/390/768/1024/1440/1920 × light/dark (12 cells), with the still captured after `?reduced=1` + `document.fonts.ready`?
- [ ] `scrollWidth ≤ clientWidth + 1` at ALL viewports; no culprit element in the overflow list?
- [ ] Visual regression with a per-project versioned baseline, `mask` on canvas/video/dynamic elements, `maxDiffPixelRatio ≤ 0.01`, and diffs reviewed (no blind updates)?
- [ ] Touch targets: zero below 24×24 without spacing (2.5.8 AA); those between 24 and 44 listed as a comfort finding?
- [ ] No image with aspect deviation > 1%; `next/image fill` with explicit `object-fit`?
- [ ] No text block with `scrollWidth > clientWidth`; body ≥ 14px at 360px; long tokens breakable?
- [ ] Fidelity verified with a number: radius ∈ `{6,8,10,12,999}`, color in the token palette, spacing in multiples of 4/8, gutter = `7vw`, font in `display/text/mono`?
- [ ] Hover/focus/press without reflow (neighbor doesn't move); visible focus never clipped by `overflow: hidden`?
- [ ] Empty and error states captured with their own screenshot and passing the overflow/regression battery?
- [ ] Mobile landscape (844×390) without overflow and with sticky-cta not covering content/footer?
- [ ] `viewport-fit=cover` in Next's `viewport` and `env(safe-area-inset-*)` on every edge fixed/sticky element?
- [ ] Boundary respected: runtime CLS and FPS delegated to `motion-qa`; markup/ARIA/screen reader to `accessibility-wcag` (no duplication, no gap)?
- [ ] Design QA Report filled out (matrix + fidelity + findings by selector/measurement/evidence), findings routed to `ui-engineer` (impl) and `diretor-de-arte` (art spec)?
</content>
