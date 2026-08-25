---
name: motion-qa
description: Adversarial animation validation with Playwright — video, trace, FPS p95, LCP/CLS/INP, and a reduced-motion pass; no video, no approval.
---

## Purpose

Ensure the LP's choreography works in time, not just in space: a static screenshot proves layout, never animation. This skill defines the environment, the executable script, and the numeric failure criteria that Motion QA (qa-motion-adversarial) uses to produce the QA Report. Findings go back to motion-engineer and creative-technologist; only the producer-orquestrador declares "ready" after the Release Checklist. Motion/perf budgets come from perf-a11y-motion — this is the machine that verifies them.

## Golden rules

1. **Screenshots don't validate animations.** Motion is jank, easing, order, and rhythm — no still captures that; the minimum evidence is video.
2. **Canonical environment: Playwright + Chromium, `reducedMotion: 'no-preference'`, `video: 'on'`, `trace: 'on'`.** Without forcing no-preference, CI/preview environments report reduce and you test the wrong page; without video+trace there's no auditing the decision.
3. **A fixed script, always run in full:** (1) preloader through to the hero; (2) slow scroll to the end; (3) frames at document progress 0 / 0.25 / 0.5 / 0.75 / 1; (4) hover over the mapped interactive elements; (5) Lighthouse + performance metrics. Skipping a step creates a blind spot that only reproduces in production.
4. **A second run with `reducedMotion: 'reduce'` serves ONLY to validate the fallback** — all content visible, nothing moves besides opacity. It never approves motion; approving motion with reduce active is approving a page with no animation.
5. **Approval requires the complete package: video, GIF, frames, trace, FPS, LCP, CLS. No video: DO NOT APPROVE.** Absolute rule — there is no "the dev showed me on his machine" exception.
6. **Measure under 4x CPU throttling (CDP `Emulation.setCPUThrottlingRate`), on desktop 1440x900 AND mobile 390x844.** On the dev's machine everything runs at 60fps; the real user is on a mid-range Android.
7. **Failure criteria are objective — any single one failing → FAILED:** FPS p95 < 55 in any section · LCP ≥ 2.5s · CLS ≥ 0.1 · INP ≥ 200ms · content invisible in reduce mode · hero (headline+CTA) invisible without JS. Without a number, "looks good" becomes opinion.
8. **QA reports, it doesn't fix.** The QA Report points to a section, a metric, and evidence; the fix belongs to motion-engineer and creative-technologist. Mixing roles hides regressions.

## Techniques

### 1. Setup — `playwright.config.ts`

```typescript
import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './qa',
  timeout: 180_000,
  outputDir: './qa/artifacts',
  reporter: [['html', { outputFolder: 'qa/report-html', open: 'never' }], ['list']],
  use: {
    baseURL: process.env.QA_URL ?? 'http://localhost:3000',
    browserName: 'chromium',
    video: 'on',
    trace: 'on',
    colorScheme: 'dark',
  },
  projects: [
    {
      name: 'desktop-motion',
      testMatch: /motion\.spec\.ts|nojs\.spec\.ts/,
      use: { viewport: { width: 1440, height: 900 }, reducedMotion: 'no-preference' },
    },
    {
      name: 'mobile-motion',
      testMatch: /motion\.spec\.ts/,
      use: {
        viewport: { width: 390, height: 844 },
        isMobile: true,
        hasTouch: true,
        reducedMotion: 'no-preference',
      },
    },
    {
      name: 'desktop-reduce',
      testMatch: /reduce\.spec\.ts/,
      use: { viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' },
    },
  ],
})
```

`reducedMotion` is a Playwright context option (equivalent to `contextOptions.reducedMotion`). CPU throttling isn't a config option — apply it per page via CDP in `beforeEach` (below). Known limitation of mobile-motion: it measures the render pipeline under mobile viewport/CPU, but scroll is fed via `mouse.wheel`; Lenis's touch path (syncTouch/touchMultiplier) isn't exercised — to cover it, use the CDP `Input.synthesizeScrollGesture` instead of wheel in that project.

### 2. Injected instrumentation — FPS p95 + LoAF + Web Vitals

Inject BEFORE any navigation with `addInitScript`. The `requestAnimationFrame` sampler accumulates frame times; p95 > 17ms = dropped below 60fps. `long-animation-frame` (LoAF) and vitals collection via `PerformanceObserver` are Chromium-only — sufficient, since the canonical environment is Chromium.

```typescript
// qa/helpers.ts
import type { Page, BrowserContext } from '@playwright/test'

export async function instrument(context: BrowserContext): Promise<void> {
  await context.addInitScript(() => {
    const w = window as unknown as {
      __qa: { frames: number[]; loafs: { start: number; duration: number }[] }
      __vitals: { lcp: number; cls: number; inp: number }
    }
    w.__qa = { frames: [], loafs: [] }
    w.__vitals = { lcp: 0, cls: 0, inp: 0 }
    let last = performance.now()
    const tick = (t: number): void => {
      w.__qa.frames.push(t - last)
      last = t
      requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
    try {
      new PerformanceObserver((l) => {
        for (const e of l.getEntries()) w.__qa.loafs.push({ start: e.startTime, duration: e.duration })
      }).observe({ type: 'long-animation-frame', buffered: true })
    } catch { /* LoAF: Chromium 123+ apenas */ }
    new PerformanceObserver((l) => {
      const e = l.getEntries().at(-1)
      if (e) w.__vitals.lcp = e.startTime
    }).observe({ type: 'largest-contentful-paint', buffered: true })
    // CLS oficial = pior "session window" (shifts com gap < 1s, janela ≤ 5s; vale o máximo), não a soma da vida inteira da página
    let clsWin = 0
    let clsWinStart = 0
    let clsWinLast = 0
    new PerformanceObserver((l) => {
      for (const e of l.getEntries() as unknown as { hadRecentInput: boolean; value: number; startTime: number }[]) {
        if (e.hadRecentInput) continue
        if (clsWin > 0 && e.startTime - clsWinLast < 1000 && e.startTime - clsWinStart < 5000) {
          clsWin += e.value
        } else {
          clsWin = e.value
          clsWinStart = e.startTime
        }
        clsWinLast = e.startTime
        w.__vitals.cls = Math.max(w.__vitals.cls, clsWin)
      }
    }).observe({ type: 'layout-shift', buffered: true })
    new PerformanceObserver((l) => {
      // só interações reais contam para INP (interactionId > 0); mouseover/pointerenter/focus têm interactionId = 0
      for (const e of l.getEntries() as unknown as { interactionId?: number; duration: number }[]) {
        if ((e.interactionId ?? 0) > 0) w.__vitals.inp = Math.max(w.__vitals.inp, e.duration)
      }
    }).observe({ type: 'event', durationThreshold: 40, buffered: true } as PerformanceObserverInit)
  })
}

export async function throttleCpu(page: Page, rate = 4): Promise<void> {
  const cdp = await page.context().newCDPSession(page)
  await cdp.send('Emulation.setCPUThrottlingRate', { rate })
}

export async function drainFps(page: Page): Promise<{ p95ms: number; fpsP95: number }> {
  const frames = await page.evaluate(() => {
    const w = window as unknown as { __qa: { frames: number[] } }
    const f = w.__qa.frames
    w.__qa.frames = []
    return f
  })
  const sorted = [...frames].sort((a, b) => a - b)
  const p95ms = sorted[Math.floor(sorted.length * 0.95)] ?? 0
  return { p95ms, fpsP95: p95ms > 0 ? Math.round(1000 / p95ms) : 0 }
}
```

Vitals alternative: inject the `web-vitals` lib's (5.3.0) IIFE bundle via `addInitScript({ path })` and collect `onLCP/onCLS/onINP` — it measures exactly what Chrome reports (confirm the bundle path inside the installed package before referencing it). INP only exists with real interactions: the script MUST click (step 4) before reading the value.

### 3. Executable script — `qa/motion.spec.ts`

Use `mouse.wheel` in steps, never `window.scrollTo` directly: on pages with Lenis, the wheel is what feeds the lerp and `ScrollTrigger.update` — a programmatic scrollTo skips the real user path.

```typescript
import { test, expect, type Page } from '@playwright/test'
import { instrument, throttleCpu, drainFps } from './helpers'

const PRELOADER = '.loader'                       // ajustar ao seletor real do projeto
const HOVERS = ['.btn-ac', '[data-cursor]', 'nav a'] // interativos mapeados no Storyboard Técnico
const MARKS = [0.25, 0.5, 0.75, 1]

async function scrollToProgress(page: Page, target: number): Promise<void> {
  const goal = await page.evaluate(
    (p) => Math.round((document.documentElement.scrollHeight - window.innerHeight) * p), target)
  for (let guard = 0; guard < 800; guard++) {
    const y = await page.evaluate(() => Math.round(window.scrollY))
    const dist = goal - y
    if (Math.abs(dist) <= 4) break
    // passos curtos = scroll lento, dá tempo ao scrub; bidirecional para o retorno ao topo também passar pelo wheel (caminho real do Lenis)
    await page.mouse.wheel(0, Math.sign(dist) * Math.min(140, Math.abs(dist)))
    await page.waitForTimeout(48)
  }
  await page.waitForFunction(() => new Promise<boolean>((res) => {
    const y0 = window.scrollY
    setTimeout(() => res(Math.abs(window.scrollY - y0) < 1), 250) // lerp do Lenis assentou
  }))
}

test('coreografia completa com evidência', async ({ page, context }, info) => {
  await instrument(context)
  await throttleCpu(page, 4) // throttle SEMPRE antes do goto: o rate persiste pela navegação; LCP medido sem 4x invalida o relatório
  await page.goto('/')

  // 1. preloader até o hero
  await page.waitForSelector(PRELOADER, { state: 'hidden', timeout: 15_000 })
  await expect(page.locator('h1').first()).toBeVisible()
  const noMotion = await page.evaluate(() => document.documentElement.classList.contains('no-motion'))
  expect(noMotion, 'motor de motion não subiu (.no-motion) — falha de ambiente, não aprovar').toBe(false)
  await page.screenshot({ path: info.outputPath('frame-p000.png'), fullPage: false })
  await drainFps(page) // zera o buffer: frames do preloader não contaminam a seção 1

  // 2–3. scroll lento + frames em 0.25/0.5/0.75/1 + FPS por trecho
  const fpsPorTrecho: Record<string, number> = {}
  for (const mark of MARKS) {
    await scrollToProgress(page, mark)
    const { fpsP95 } = await drainFps(page)
    fpsPorTrecho[`p${mark * 100}`] = fpsP95
    await page.screenshot({ path: info.outputPath(`frame-p${String(mark * 100).padStart(3, '0')}.png`) })
  }

  // 4. hovers e cliques (cliques alimentam o INP)
  await scrollToProgress(page, 0)
  for (const sel of HOVERS) {
    const el = page.locator(sel).first()
    if (await el.count() === 0) continue
    await el.hover()
    await page.waitForTimeout(450) // micro-interação (token 0.2–0.4s) termina antes do próximo hover
  }
  const cta = page.locator(HOVERS[0]).first()
  // neutralizar navegação: se o CTA (âncora) navegar, o addInitScript reexecuta e zera __qa/__vitals — as métricas virariam as da página errada
  await cta.evaluate((el) => el.addEventListener('click', (e) => e.preventDefault(), { once: true }))
  await cta.click({ trial: false }).catch(() => {}) // pelo menos 1 interação real p/ INP, sem sair da LP
  await page.waitForTimeout(600)
  expect(new URL(page.url()).pathname, 'página navegou após o clique — métricas seriam de outra rota; falha de ambiente, não aprovar').toBe('/')
  const { fpsP95: fpsHover } = await drainFps(page)

  // 5. métricas finais
  const vitals = await page.evaluate(() =>
    (window as unknown as { __vitals: { lcp: number; cls: number; inp: number } }).__vitals)
  const loafs = await page.evaluate(() =>
    (window as unknown as { __qa: { loafs: { start: number; duration: number }[] } })
      .__qa.loafs.filter((l) => l.duration > 50))
  const pesoKB = await page.evaluate(() => {
    const res = performance.getEntriesByType('resource') as PerformanceResourceTiming[]
    const nav = performance.getEntriesByType('navigation') as PerformanceNavigationTiming[]
    return Math.round((res.reduce((s, r) => s + (r.transferSize || 0), 0) + (nav[0]?.transferSize || 0)) / 1024)
  })
  await info.attach('metricas', {
    body: JSON.stringify({ fpsPorTrecho, fpsHover, vitals, loafs, pesoKB }, null, 2),
    contentType: 'application/json',
  })

  // Gates objetivos (regra de ouro 7)
  for (const [trecho, fps] of Object.entries(fpsPorTrecho)) {
    expect(fps, `FPS p95 na seção ${trecho}`).toBeGreaterThanOrEqual(55)
  }
  expect(vitals.lcp, 'LCP').toBeLessThan(2500)
  expect(vitals.cls, 'CLS').toBeLessThan(0.1)
  expect(vitals.inp, 'INP').toBeLessThan(200)
})
```

If the page marks sections with `data-screen-label` (the reference LP's standard), drain FPS per section instead of per quartile — the report becomes addressable ("section 04 dropped to 48fps"), not "somewhere in the middle."

### 4. Reduced-motion pass — `qa/reduce.spec.ts`

QA runs the `reducedMotion: 'reduce'` context pass — the baseline: the engine honors the OS's `prefers-reduced-motion` via `gsap.matchMedia()`, and this emulation exercises the default gate. **When the project ALSO exposes an explicit flag** (like XiaX, `reduced` via `useMotion({ reduced: true })`), the QA build must expose an additional trigger (e.g., a `?reduced=1` query read by the page), and this test fires that trigger IN ADDITION TO the context's `reducedMotion: 'reduce'` — covering the case where XiaX decoupled the flag from the OS (exception logged in the Technical Storyboard). Both paths lead to the SAME static branch.

```typescript
import { test, expect } from '@playwright/test'

test('fallback reduce: tudo visível, nada se move além de opacity', async ({ page }) => {
  await page.goto('/?reduced=1')
  await page.waitForSelector('.loader', { state: 'hidden', timeout: 15_000 }).catch(() => {})
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight)) // sem Lenis ativo, scrollTo basta
  await page.waitForTimeout(800)

  const invisiveis = await page.evaluate(() => {
    const bad: string[] = []
    document.querySelectorAll<HTMLElement>('[data-reveal], [data-hreveal], h1, h2, .btn-ac').forEach((el) => {
      const cs = getComputedStyle(el)
      if (parseFloat(cs.opacity) < 0.99 || cs.visibility === 'hidden') {
        bad.push(`${el.tagName}.${el.className}`)
      }
    })
    return bad
  })
  expect(invisiveis, 'conteúdo invisível no modo reduce').toEqual([])

  const moveram = await page.evaluate(async () => {
    const els = [...document.querySelectorAll('[data-reveal], .hand, .mq-t')].slice(0, 40)
    const snap = (): string[] => els.map((el) => { const r = el.getBoundingClientRect(); return `${r.x}:${r.y}` })
    const a = snap()
    await new Promise((r) => setTimeout(r, 700))
    const b = snap()
    return a.filter((v, i) => v !== b[i]).length
  })
  expect(moveram, 'elementos ainda se movem no modo reduce').toBe(0)
})
```

### 5. Hero without JS — `qa/nojs.spec.ts`

```typescript
import { test, expect } from '@playwright/test'

test('hero legível com JavaScript desabilitado', async ({ browser }, info) => {
  const ctx = await browser.newContext({
    javaScriptEnabled: false,
    viewport: { width: 1440, height: 900 },
  })
  const page = await ctx.newPage()
  await page.goto(process.env.QA_URL ?? 'http://localhost:3000')
  await expect(page.locator('h1').first()).toBeVisible()
  await expect(page.locator('a.btn-ac, [data-qa="hero-cta"]').first()).toBeVisible()
  const opacity = await page.locator('h1').first()
    .evaluate((el) => parseFloat(getComputedStyle(el).opacity))
  expect(opacity).toBeGreaterThanOrEqual(0.9)
  await page.screenshot({ path: info.outputPath('no-js-hero.png') })
  await ctx.close()
})
```

If this test fails, the engine is setting an invisible initial state in the HTML/CSS instead of via JS (`gsap.set`/`from` at init) — send it back to motion-engineer citing motion-foundation's graceful-degradation rule.

### 6. Lighthouse + GIF

`playwright-lighthouse` (4.0.0) has been stagnant since 2024 (a fragile mechanism: requires `--remote-debugging-port`, opens its own page, Chromium-only) — do NOT use it as a CI gate. Run the Lighthouse CLI against the same URL:

```bash
npx lighthouse "$QA_URL" --preset=desktop \
  --output=json --output=html --output-path=./qa/lighthouse/desktop \
  --chrome-flags="--headless=new"
npx lighthouse "$QA_URL" --output=json --output=html \
  --output-path=./qa/lighthouse/mobile --chrome-flags="--headless=new"
```

GIF (mandatory deliverable) from the webm video Playwright recorded:

```bash
ffmpeg -i qa/artifacts/<teste>/video.webm -vf "fps=15,scale=720:-1" qa/deliverables/motion.gif
```

The trace opens with `npx playwright show-trace qa/artifacts/<teste>/trace.zip` — attach the path in the report.

### 7. QA Report template (mandatory, numeric fields)

```markdown
# Relatório de QA — <projeto> — <data> — commit <sha>
## Veredito: APROVADO | REPROVADO

## Evidências (sem vídeo = REPROVADO automático)
- Vídeo desktop: qa/artifacts/.../video.webm · Vídeo mobile: ...
- GIF resumo: qa/deliverables/motion.gif
- Frames: p000 / p025 / p050 / p075 / p100 (desktop + mobile)
- Trace: qa/artifacts/.../trace.zip · Lighthouse: qa/lighthouse/*.html

## Métricas (Chromium, CPU 4x)
| Métrica            | Desktop | Mobile | Limite      | Status |
|--------------------|---------|--------|-------------|--------|
| FPS p95 pior seção |         |        | ≥ 55        |        |
| LCP                |         |        | < 2.5s      |        |
| CLS                |         |        | < 0.1       |        |
| INP                |         |        | < 200ms     |        |
| Peso da página     |         |        | orçamento skills/08: ≤ 1,5 MB transferido no first load · JS ≤ 300 KB gzip | |

## Top-5 assets por peso (skills/08 — cada um com justificativa escrita ou corte)
| # | Asset | Peso transferido | Justificativa ("compra qual momento?") ou CORTAR |

## FPS p95 por seção (desktop / mobile)
| Seção (data-screen-label ou quartil) | frame time p95 | FPS p95 | Status |

## Long Animation Frames > 50ms
| t início | duração | seção provável |

## Passadas especiais
- reducedMotion 'reduce': conteúdo 100% visível? [ ] · nada se move além de opacity? [ ]
- Hero sem JS: headline visível? [ ] · CTA visível? [ ]

## Achados (para motion-engineer / creative-technologist)
1. <seção> — <métrica que falhou> — <evidência: timestamp do vídeo/trace>
```

## Libraries and plugins

| Package | Version | Install | When to use |
|---|---|---|---|
| @playwright/test | 1.61.1 | `npm i -D @playwright/test@1.61.1 && npx playwright install chromium` | Runner for the whole QA pass: context, video, trace, CDP |
| web-vitals | 5.3.0 | `npm i -D web-vitals@5.3.0` | Alternative to manual LCP/CLS/INP collection (bundle injected via addInitScript) |
| lighthouse | latest (peer range ≥10) | `npm i -D lighthouse` | Lighthouse report via CLI against the same URL (step 5 of the script) |
| playwright-lighthouse | 4.0.0 | `npm i -D playwright-lighthouse` | AVOID — stagnant since 2024; cited only to veto it as a CI gate |
| ffmpeg | system | `brew install ffmpeg` | Convert Playwright's webm into the report's mandatory GIF |

## Anti-patterns

- **Approving by screenshot.** Symptom: 20fps jank on the scrub goes unnoticed and only shows up in production, on the client's device.
- **Running with no CPU throttle.** Symptom: 60fps on the dev's M-series chip, 34fps on a mid-range Android — the report lies.
- **Testing only with `reducedMotion: 'reduce'`** (the default for many CIs/previews). Symptom: no animation runs, every test "passes," zero motion coverage.
- **`window.scrollTo` as the main scroll path.** Symptom: Lenis/ScrollTrigger don't receive the real wheel; scrubs and triggers don't fire the way they would for the user.
- **Reading INP without having clicked anything.** Symptom: INP = 0 in the report, a false APPROVED; INP requires a real interaction.
- **Average FPS instead of p95.** Symptom: an average of 58fps hides 120ms stalls exactly during the signature moments.
- **Depending on `playwright-lighthouse` as a gate.** Symptom: silent breakage with a new Playwright version (an unmaintained package since 2024), a green pipeline that measures nothing.
- **Relying on LoAF/`long-animation-frame` outside Chromium.** Symptom: the observer throws/returns empty on WebKit/Firefox; the API is Chromium-only.
- **Ignoring `.no-motion` on `<html>` during the test.** Symptom: the engine never came up, the page is in emergency static mode — and QA "approves" an LP with no motion.
- **QA editing the code to "pass."** Symptom: a hidden regression; the canonical flow sends findings back to motion-engineer/creative-technologist.

## Approval checklist

- [ ] Did it run across all 3 Chromium projects: desktop-motion (1440x900) and mobile-motion (390x844) with 4x CPU throttling; desktop-reduce only validates the static fallback (throttle unnecessary)?
- [ ] Was the full script executed: preloader→hero, slow wheel scroll, frames at 0/0.25/0.5/0.75/1, hovers + at least 1 real click, Lighthouse CLI?
- [ ] Does a webm video exist for desktop AND mobile (no video = FAILED, no discussion)?
- [ ] Was a GIF generated from the video and linked in the report?
- [ ] Is the trace .zip attached and does it open with `npx playwright show-trace`?
- [ ] Is FPS p95 ≥ 55 in EVERY section, on both viewports?
- [ ] Are LCP < 2.5s · CLS < 0.1 · INP < 200ms (measured in the browser, 4x CPU)?
- [ ] Is the Long Animation Frames > 50ms list filled in (empty = declare "none")?
- [ ] Reduce pass: is 100% of the content visible, zero movement besides opacity (OS `reduce` media query exercised; and, when the project exposes an explicit flag, is the `?reduced=1` trigger also fired)?
- [ ] Hero without JS: are the headline and CTA visible and legible (opacity ≥ 0.9)?
- [ ] Is `<html>` free of `.no-motion` during the motion pass?
- [ ] Was the QA Report filled out in the template, with every numeric field, and findings addressed to motion-engineer/creative-technologist?
