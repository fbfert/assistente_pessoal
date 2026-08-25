---
name: web-performance
description: Guarantees Lighthouse 100 across all 4 categories and Core Web Vitals in the green (LCP/CLS/INP) for the entire build — RSC-first, images/fonts/JS/CSS, streaming, third-party, cache, and measurement; use when architecting or auditing the LP's network/loading performance.
---

# Web Performance — Lighthouse 100 across the entire build

## Purpose

A premium landing page is fast by architecture, not by a final optimization pass: the weight budget decides how a component is written from the first line, not afterward. This skill guarantees **Lighthouse 100 across all 4 categories (Performance, Accessibility, Best Practices, SEO)** and **Core Web Vitals in the green** for everything the page loads — RSC vs. client islands, the LCP image, CLS-free fonts, the JS budget, CSS purging, streaming, third-party, cache/headers, and the measurement that proves every number. It owns the performance of the entire build; *motion* performance (FPS, `will-change`, DPR, reduced-motion, WCAG depth) stays with `perf-a11y-motion`, and asset *weight in bytes* with `asset-pipeline` — this skill consumes those thresholds and doesn't contradict them. **Gate-but-delegate on non-perf categories:** this skill LOCKS all 4 categories at 100 in CI, but the CONTENT of the non-performance categories belongs to other owners — the **Accessibility** category belongs to `accessibility-wcag` (contrast, `label`/`for`, accessible name, ARIA validity, touch targets, duplicate ids; `perf-a11y-motion` covers only the *motion* slice), and the **technical SEO tags** belong to the SEO Spec's owner (`seo-technical-onpage`). This skill only guarantees the *performance* angle of those categories and cross-references their owners, without reimplementing the domain. It's consumed by the Next.js Architect (`nextjs-arquiteto`) and the UI Engineer (`ui-engineer`) when assembling the **Front-end Architecture** and the **Component Library**; it's audited with evidence by Motion QA (`qa-motion-adversarial`) via `motion-qa`, and the Producer (`producer-orquestrador`) re-verifies the numbers in the **Release Readiness Report** / **Release Checklist**. This skill's output is the **Perf Report**. The JS you don't ship is the fastest kind.

## Golden rules

None of the rules below can be relaxed. Violations fail the QA Report and block the Perf Report.

1. **RSC by default; `"use client"` only at interactive leaves.** Server Components ship zero JS to the client; every extra `"use client"` drags React + its dependencies into the bundle. *Why:* first load and INP are governed by how much JS the main thread has to parse/compile — RSC-first is the only way to hold both down.
2. **First-load JS ≤ 300 KB gzip, measured in CI (the same ceiling as `asset-pipeline`).** *Why:* above that, main-thread parse/compile blows the TBT (the INP lab proxy) on mid-range hardware — no image optimization makes up for it.
3. **Core Web Vitals in the green, evaluated at field p75 (CrUX): LCP < 2.5 s, CLS < 0.1 (target ≈ 0), INP < 200 ms.** Thresholds IDENTICAL to `perf-a11y-motion`'s; the lab proxy for INP is TBT < 200 ms. *Why:* these are Google's "good" ceilings; Lighthouse (lab) diagnoses, the field decides the status.
4. **Lighthouse 100 across all 4 categories as a CI gate (`minScore: 1`), on the median of 3 runs.** *Why:* 100 isn't vanity — it's the absence of silent regression; any drop breaks the build before deploy, when the cost of fixing it is still low.
5. **The LCP image is the ONLY one with `priority`; every media element has explicit `width`/`height`.** `priority` injects a preload + `fetchpriority="high"`; the dimensions reserve the box. *Why:* a second `priority` steals bandwidth from the real LCP, and media without dimensions is guaranteed CLS the instant the file arrives.
6. **AVIF with a WebP fallback, negotiated via the `Accept` header — `formats: ['image/avif','image/webp']`, ORDER matters.** *Why:* AVIF cuts 30–70% vs. JPEG/PNG and the array order defines the optimizer's preference (first match wins; no match, original format).
7. **Fonts only via `next/font` (self-hosted + `size-adjust` fallback), zero external `<link>`.** *Why:* the metric-adjusted fallback zeroes out text CLS on the fallback→webfont swap; a request to a font CDN is render-critical and reintroduces the shift `size-adjust` just eliminated.
8. **`dynamic(..., { ssr: false })` only inside a `"use client"` wrapper.** It's a build error in a Server Component on Next 15/16. *Why:* a Server Component can't turn off SSR for a child; the canonical pattern is a client wrapper that does the `dynamic` and gets imported by the server.
9. **Third-party loads via `lazyOnload` or a facade; nothing third-party blocks first paint.** *Why:* third-party script is main-thread you don't control — it runs at idle or on click, never `beforeInteractive`/`afterInteractive` on the critical path, or it tanks TBT and INP.
10. **CSS purged by Tailwind (correct `content`), no concatenated dynamic class.** *Why:* `bg-${cor}` isn't seen by the JIT and gets purged in production (style disappears) or forces a `safelist` that bloats the bundle — the class has to be literal and static in the source.
11. **Static assets versioned by hash and served `immutable` (1-year cache).** *Why:* re-downloading an immutable asset is latency paid for nothing; `/_next/static` already ships `immutable` — never override it with `no-store` on a hashed file.
12. **Streaming with `<Suspense>` for everything below the fold that fetches data; the hero is server HTML and never waits on slow data.** *Why:* streaming delivers the shell + hero early (low TTFB/LCP) and defers the cost of the rest — without a boundary, the entire page is held hostage by the slowest endpoint.
13. **Every threshold is measured, never estimated: the Perf Report brings together Lighthouse CI + `@next/bundle-analyzer` + field `web-vitals`.** *Why:* a budget with no attached number isn't a rule, it's a wish — and the Producer doesn't declare "ready" over a wish.

## Techniques

### 1. RSC-first, client islands, and the `ssr:false` wrapper

A Server Component is the default (zero JS, can be `async`, fetches data directly). `"use client"` marks the boundary and only belongs on the interactive LEAF (form, Radix dropdown, toggle) — never on `page.tsx`/`layout.tsx`.

```tsx
// app/(marketing)/page.tsx — Server Component (no "use client"): layout and copy travel as HTML, 0 KB of JS
import { Hero } from "@/components/hero";                 // RSC: promise + CTA exist with no JS (progressive enhancement)
import { PricingTable } from "@/components/pricing-table"; // RSC
import { NewsletterForm } from "@/components/newsletter-form"; // the only "use client" island in this fold

export default function Page(): React.ReactElement {
  return (
    <>
      <Hero />
      <PricingTable />
      <NewsletterForm />
    </>
  );
}
```

`ssr: false` is an ERROR inside a Server Component (Next 15/16) — isolate the `dynamic` in a client wrapper and import the wrapper on the server:

```tsx
// components/hero-canvas-island.tsx — CLIENT wrapper: the ONLY place ssr:false is valid
"use client";

import dynamic from "next/dynamic";

// ssr:false turns off server rendering for the WebGL canvas (browser-only); a placeholder with the SAME box → zero CLS.
const HeroCanvas = dynamic(() => import("./hero-canvas"), {
  ssr: false,
  loading: () => <div aria-hidden style={{ position: "absolute", inset: 0 }} />,
});

export function HeroCanvasIsland(): React.ReactElement {
  return <HeroCanvas />;
}
```

Decision rule: stay RSC until you need state/effect/event/a browser API; then create the SMALLEST possible island at the leaf. WebGL implementation lives in `webgl-differentiator`; the animation engine, in `motion-foundation`.

### 2. The LCP image: `next/image` with `priority`, `sizes`, and dimensions

The LCP image is the only one with `priority`. A static import infers `width`/`height` (zero CLS) and generates a `srcset`; `sizes` prevents downloading twice the needed size.

```tsx
// components/hero.tsx (Server Component)
import Image from "next/image";
import hero from "../../public/img/hero.jpg"; // output of the sharp pipeline (asset-pipeline) — never the original; static import ⇒ inferred width/height

export function HeroImage(): React.ReactElement {
  return (
    <Image
      src={hero}
      alt="Ficha de gestão preenchida"
      priority // the ONLY priority image: injects a preload + fetchpriority="high" on the <img>
      sizes="(max-width: 860px) 92vw, 48vw" // downloads the right size per breakpoint
      placeholder="blur"
    />
  );
}
```

```js
// next.config.js (CommonJS, as the project and perf-a11y-motion already use) — ADDITIVE MERGE into the existing config:
// preserve output:'standalone' (Docker/VPS deploy), redirects, rewrites, and the X-Robots-Tag: noindex on internal
// routes (/xiax, /selecao-tenant). AVIF preferred, WebP fallback; ORDER defines the Accept preference.
const nextConfig = {
  output: "standalone", // do NOT remove — required by the deploy build
  images: { formats: ["image/avif", "image/webp"] },
  // ...existing redirects, rewrites, and noindex headers stay as-is
};
module.exports = nextConfig;
```

If the LCP element does NOT go through `next/image` (e.g., an `<img>` from a CMS/third-party), apply the hint on the attribute — in JSX it's `fetchPriority` (camelCase), supported since React 18.3+:

```tsx
<img src="/hero.avif" width={1080} height={720} fetchPriority="high" decoding="async" alt="Ficha de gestão preenchida" />
```

The hero's byte budget (≤ 200 KB) and the AVIF/WebP production belong to `asset-pipeline`; this skill guarantees the DELIVERY (correct preload, a single `priority`, `sizes`, dimensions). Everything below the fold is lazy (the `next/image` default).

### 3. Fonts with zero CLS: `next/font` with `size-adjust`

`next/font` self-hosts the font at build time (zero external request at runtime) and automatically generates a `size-adjust` fallback — the fallback→webfont swap doesn't shift a single line. `<link>` to Google Fonts or a font `@import` is forbidden.

```ts
// app/(marketing)/fonts.ts — self-host + adjusted fallback (zero CLS); exposes CSS vars consumed in the .page scope
import { Anton, IBM_Plex_Mono } from "next/font/google";

export const anton = Anton({
  weight: "400",
  subsets: ["latin"],  // latin covers all pt-BR accents — subset details in asset-pipeline
  display: "swap",     // text visible immediately on the adjusted fallback
  variable: "--font-anton",
  // adjustFontFallback = true by default: it's what matches the fallback's metrics and zeroes the shift
});

export const plexMono = IBM_Plex_Mono({
  weight: ["400", "500"],
  subsets: ["latin"],
  display: "swap",
  variable: "--font-plex",
});
```

Family count (max 2), weights, and `woff2` are governed by `asset-pipeline`. SplitText with a custom font (animated headline): split only after `document.fonts.ready` — detail in `motion-foundation`.

### 4. JS budget: tree-shaking + `@next/bundle-analyzer`

Always named imports; never `import * as` from a large library, nor a barrel re-export (`export *`) that blocks tree-shaking. For libraries with many exports (icons), use `optimizePackageImports`.

```js
// next.config.js (CommonJS) — analyzer under a flag; MERGE into the existing config, without deleting
// output:'standalone', redirects, rewrites, or the noindex headers on internal routes.
const withBundleAnalyzer = require("@next/bundle-analyzer")({ enabled: process.env.ANALYZE === "true" });

const nextConfig = {
  output: "standalone", // preserve
  images: { formats: ["image/avif", "image/webp"] },
  experimental: {
    // Turns `import { X } from 'lib'` into an import of X's subpath → only X enters the bundle.
    optimizePackageImports: ["lucide-react", "@radix-ui/react-icons"],
  },
  // ...existing redirects, rewrites, and headers (incl. X-Robots-Tag: noindex) preserved
};

module.exports = withBundleAnalyzer(nextConfig);
```

```bash
ANALYZE=true npm run build   # first-load JS treemap: nothing above 300 KB gzip
```

Radix can be imported both via the single `radix-ui` package and the individual `@radix-ui/react-*` packages; both are tree-shakeable — the package choice belongs to the **Component Library**. Here there's one rule only: every KB of first-load JS has to justify itself in the treemap or it's out.

### 5. CSS: Tailwind purge and class discipline

Tailwind 3.4's JIT generates ONLY the classes it finds in the `content` files. A wrong glob either purges a used class (style disappears) or bloats the CSS.

```ts
// tailwind.config.ts — content defines exactly what the JIT scans
import type { Config } from "tailwindcss";

export default {
  content: ["./src/app/**/*.{ts,tsx,mdx}", "./src/components/**/*.{ts,tsx}"],
  theme: { extend: {} },
} satisfies Config;
```

Never concatenate a class name — the JIT doesn't see the final string:

```tsx
// WRONG: `bg-${tone}-500` doesn't appear literal in the source → purged in production.
const bad = `bg-${tone}-500`;

// RIGHT: complete, static classes, picked via a map (purge-safe).
const TONE = { azul: "bg-blue-500", ink: "bg-slate-900" } as const;
const good = TONE[tone];
```

`cva` (class-variance-authority) is purge-safe because it generates variants from static literals in the source. `safelist` is a last resort, only for classes actually generated at runtime — every entry is extra weight. **Critical CSS:** Tailwind's CSS already comes out minimal after purge; `experimental.optimizeCss` (inlined via beasties/Critters) is optional and still experimental — evaluate it with measurement before enabling, it's not a requirement.

### 6. Streaming with Suspense — the hero never waits on slow data

The hero is server HTML OUTSIDE any boundary. Below-the-fold sections that fetch data go under `<Suspense>`: the server streams the rest once the fetch resolves, without holding back the shell or the LCP.

```tsx
// app/(marketing)/page.tsx
import { Suspense } from "react";
import { Hero } from "@/components/hero";                 // static RSC: LCP arrives on the first flush
import { Testimonials } from "@/components/testimonials"; // async RSC: does a slow data fetch

export default function Page(): React.ReactElement {
  return (
    <>
      <Hero />
      <Suspense fallback={<TestimonialsSkeleton />}>
        {/* streaming: the hero already painted; this arrives once the fetch resolves */}
        <Testimonials />
      </Suspense>
    </>
  );
}
```

The `fallback` (skeleton) has EXACTLY the same box as the final content (zero CLS). A shimmering skeleton respects reduced-motion and consumes the tokens from `lib/motion/motion-tokens.ts` — see `perf-a11y-motion`, never an inline duration. `loading.tsx` on the route segment gives the same effect at the page level.

### 7. Third-party: `next/script` + facade

Analytics/consent/pixels load `lazyOnload` (runs at idle, off the critical path). `beforeInteractive` is only for the rare script that must run before hydration.

```tsx
// Lightweight analytics: lazyOnload never competes with the LCP or the first input
import Script from "next/script";

<Script src="https://plausible.io/js/script.js" strategy="lazyOnload" />;
```

A heavy embed (YouTube, map, chat) goes through a **facade**: a static, clickable poster that only swaps for the real iframe on interaction — cuts hundreds of KB and long tasks from the first load.

```tsx
// components/video-facade.tsx
"use client";

import { useState } from "react";

export function VideoFacade({ id, poster }: { id: string; poster: string }): React.ReactElement {
  const [open, setOpen] = useState(false);
  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} aria-label="Reproduzir vídeo">
        <img src={poster} width={1280} height={720} alt="" loading="lazy" decoding="async" />
      </button>
    );
  }
  return (
    <iframe
      src={`https://www.youtube-nocookie.com/embed/${id}?autoplay=1`}
      width={1280}
      height={720}
      allow="autoplay; encrypted-media"
      title="Vídeo"
    />
  );
}
```

First-party alternative: `@next/third-parties` provides `YouTubeEmbed` (a ready-made facade) and already-lazy `GoogleAnalytics`/`GoogleTagManager` — use them when the helper covers the case, without reinventing it. `strategy="worker"` (Partytown) is experimental: only with measurement.

### 8. Cache and headers (perf + Best Practices)

`/_next/static/*` already ships `Cache-Control: public, max-age=31536000, immutable` (hashed). Configure the image optimizer's TTL and the security headers that also score in Best Practices.

```js
// next.config.js (CommonJS, excerpt) — the async headers() is an ADDITIVE MERGE: concatenate these
// global headers to the ones that already exist; do NOT remove the X-Robots-Tag: noindex on /xiax and /selecao-tenant.
const nextConfig = {
  output: "standalone", // preserve (deploy)
  images: { formats: ["image/avif", "image/webp"], minimumCacheTTL: 31536000 },
  async headers() {
    return [
      // ...existing rules (X-Robots-Tag: noindex on internal routes) stay
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
        ],
      },
    ];
  },
  // existing redirects/rewrites preserved
};

module.exports = nextConfig;
```

The `csp-xss` audit (Best Practices) requires an effective CSP. The rigorous route is a per-request nonce CSP via `middleware.ts` (`Content-Security-Policy` with `strict-dynamic`) — but legitimate inline scripts (Technique 9's JSON-LD, Next's bootstrap) need the nonce, and a wrong CSP breaks the page. Implement it with a nonce and TEST before shipping; if you choose not to have a CSP, record and justify the absence in the Perf Report (the audit is informative, it doesn't zero out the category by itself).

### 9. SEO and Best Practices for Lighthouse 100

The technical SEO structure (Metadata API, `robots.ts`, `sitemap.ts`, JSON-LD) belongs to the owner of the **SEO Spec** / `seo-technical-onpage` — which holds the strategy (keywords, copy) AND the technical structure, not just copy. This skill does NOT reimplement that domain: it records only the *performance* angle — metadata in an RSC has **zero runtime cost** and JSON-LD from a Server Component ships **with no JS to the client** — and cross-references `seo-technical-onpage` as the canonical source for the tags. The snippets below illustrate that zero-cost, not the source of truth for the tags. Metadata only in a Server Component.

```ts
// app/(marketing)/page.tsx — static object; use generateMetadata() when you need to fetch data
import type { Metadata } from "next";

export const metadata: Metadata = {
  metadataBase: new URL("https://xiax.com.br"),
  title: "Gestão Nossa — gestão simples para o seu negócio",
  description: "Organize clientes, cobranças e rotina numa ferramenta só.", // missing = SEO < 100
  alternates: { canonical: "/" },
  openGraph: { images: ["/opengraph-image.png"] }, // static artwork (asset-pipeline); takes priority over the object
  robots: { index: true, follow: true },
};
```

Native `robots.ts` and `sitemap.ts` (Next serializes the XML) — always prefer these over `next-sitemap`:

```ts
// app/robots.ts → served at /robots.txt
import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return { rules: { userAgent: "*", allow: "/" }, sitemap: "https://xiax.com.br/sitemap.xml" };
}
```

```ts
// app/sitemap.ts → served at /sitemap.xml
import type { MetadataRoute } from "next";

export default function sitemap(): MetadataRoute.Sitemap {
  return [{ url: "https://xiax.com.br", lastModified: new Date(), changeFrequency: "weekly", priority: 1 }];
}
```

JSON-LD is injected by a Server Component via `<script>` (there's no `generateMetadata`-like API for it); `schema-dts` provides the types and `<` is escaped against XSS:

```tsx
// components/organization-json-ld.tsx (Server Component)
import type { Organization, WithContext } from "schema-dts";

export function OrganizationJsonLd(): React.ReactElement {
  const data: WithContext<Organization> = {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: "Gestão Nossa",
    url: "https://xiax.com.br",
  };
  return (
    <script
      type="application/ld+json"
      // Escaping `<` prevents the payload from closing/injecting a tag into the serialized HTML.
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, "\\u003c") }}
    />
  );
}
```

Remaining Best Practices: HTTPS on deploy, `<html lang="pt-BR">`, doctype and charset (Next emits these), images with correct aspect ratio (explicit dimensions from Technique 2), zero console errors in production (QA verifies this), and no deprecated API.

### 10. Measurement: Lighthouse CI + field web-vitals → the Perf Report

The CI gate locks the 4 scores at 100, the lab CWV trio (the same thresholds as `perf-a11y-motion`), and the JS budget, all in one file:

```json
// lighthouserc.json — 3 runs (the median reduces Lighthouse's variance)
{
  "ci": {
    "collect": { "url": ["http://localhost:3000/"], "numberOfRuns": 3 },
    "assert": {
      "assertions": {
        "categories:performance": ["error", { "minScore": 1 }],
        "categories:accessibility": ["error", { "minScore": 1 }],
        "categories:best-practices": ["error", { "minScore": 1 }],
        "categories:seo": ["error", { "minScore": 1 }],
        "largest-contentful-paint": ["error", { "maxNumericValue": 2500 }],
        "cumulative-layout-shift": ["error", { "maxNumericValue": 0.1 }],
        "total-blocking-time": ["error", { "maxNumericValue": 200 }],
        "resource-summary:script:size": ["error", { "maxNumericValue": 307200 }]
      }
    }
  }
}
```

`minScore: 1` = 100. `total-blocking-time` at 200 ms is the LAB proxy for INP (which only exists with real interaction, in the field). `307200` = 300 KB — but watch out: `resource-summary:script:size` sums the transfer of EVERY script in the audited navigation (including third-party `lazyOnload` and `dynamic()` islands loaded during the run), so it's a STRICTER proxy for **total** JS, not literally the *first-load*. The ≤ 300 KB first-load ceiling is billed separately from the `next build`/`@next/bundle-analyzer` output (only the first-load chunks); the two measurements can diverge and are SEPARATE budgets under the same number, not the same metric. The real INP and the field CWV (p75) come from `web-vitals` — the reporter is the same `VitalsReporter` from `perf-a11y-motion` (`onLCP`/`onCLS`/`onINP` from `web-vitals` v5; `onFID` no longer exists). To diagnose bad INP, the `web-vitals/attribution` build points to `longestScript`.

**The Perf Report** (this skill's output) is the table below, attached to the QA Report and re-verified by the Producer in the Release Readiness Report / Release Checklist:

| Metric | Target | Source |
|---|---|---|
| Lighthouse Performance / A11y / Best Practices / SEO | 100 / 100 / 100 / 100 | Lighthouse CI (median of 3) |
| LCP · CLS · INP (field, p75) | < 2.5 s · < 0.1 · < 200 ms | `web-vitals` in production |
| TBT (lab, INP proxy) | < 200 ms | Lighthouse CI |
| First-load JS | ≤ 300 KB gzip | `@next/bundle-analyzer` |

## Libraries and plugins

| Package | Version | Install | When to use |
|---|---|---|---|
| next | ^15.5 | already in the project (App Router) | `next/image`, `next/font`, `next/dynamic`, `next/script`, Metadata API, `<Suspense>`/streaming — identical APIs on 16.x |
| @next/bundle-analyzer | ^15.5 (always = `next`) | `npm i -D @next/bundle-analyzer@15.5` | first-load JS treemap before release (the 300 KB gate) |
| @next/third-parties | ^15.5 (always = `next`) | `npm i @next/third-parties@15.5` | `YouTubeEmbed` (facade) and lazy first-party `GoogleAnalytics`/`GoogleTagManager` |
| web-vitals | ^5.3.0 | `npm i web-vitals` | field LCP/CLS/INP (p75); the `attribution` build diagnoses INP |
| @lhci/cli | ^0.15 (pinned) | `npm i -D @lhci/cli@0.15` | CI gate for Lighthouse 100 + lab CWV + JS budget |
| schema-dts | ^2.0 (types; devDependency) | `npm i -D schema-dts` | type the SEO category's JSON-LD (schema.org) |
| tailwindcss | ^3.4 | already in the project | CSS purge/JIT via `content` (decision rule from Technique 5) |

`sharp`, `@next/font` byte weight, and `ffmpeg` belong to `asset-pipeline`; `gsap`/`lenis` to `motion-foundation`. Lighthouse runs via `@lhci/cli` (not the old CLI): 0.15.x bundles Lighthouse **12.x** (12.6.1) — standalone Lighthouse 13 requires Node 22.19+ and is still NOT the runtime `@lhci/cli` executes (as of Jul/2026). Pinning `@lhci/cli` fixes which Lighthouse (and which score curves/audits) runs in the gate.

## Anti-patterns

- **`"use client"` on `page.tsx`/`layout.tsx`** → drags the whole tree to the client; first-load JS blows up and INP degrades. `"use client"` belongs at the leaf.
- **A second image with `priority`** → two preloads competing for bandwidth; the real LCP arrives later. Only the LCP gets `priority`.
- **Hero as a CSS `background-image`** → invisible to the preload scanner; late LCP even with a light image (see `asset-pipeline`).
- **`dynamic(ssr:false)` directly in a Server Component** → build error on Next 15/16; wrap it in a `"use client"` wrapper.
- **Google Fonts `<link>` / font `@import`** → an external render-critical request + FOUT with shift; `next/font` self-hosts and adjusts the metric.
- **Concatenated Tailwind class (`bg-${x}`)** → purged in production; symptom: a colorless component in the build, correct in dev.
- **Third-party `afterInteractive`/`beforeInteractive` on the critical path** → third-party main-thread at boot; TBT and INP crater. Use `lazyOnload`/a facade.
- **A heavy embed (YouTube/map/chat) via a direct `<iframe>`** → hundreds of KB and long tasks on the first load; symptom: bad LCP and TBT in a section that hasn't even appeared. A facade fixes it.
- **`Cache-Control: no-store` on a hashed asset** → an eternal re-download of something immutable; latency paid on every visit.
- **A page with no `<Suspense>` above a slow fetch** → the entire shell waits on the worst endpoint; TTFB/LCP held hostage. Stream the rest.
- **Barrel `export *` / `import * as` from an icon library** → tree-shaking breaks; symptom: 200 KB of unused icons in the treemap.
- **JSON-LD without escaping `<`, or injected by a client script** → an XSS vector and extra client JS; inject it from a Server Component with `<` escaped.
- **Missing meta description / `robots` blocking / no canonical** → the SEO category drops below 100 in the gate.
- **An invalid CSP breaking inline scripts** → JSON-LD/Next's bootstrap stop running; test the CSP with a nonce before shipping (or record its absence).
- **An eyeballed budget with no `@lhci/cli`/analyzer** → a silent regression enters the deploy; the Perf Report requires a number, not an impression.
- **Reimplementing `srcset`/lazy loading by hand instead of `next/image`** → incomplete srcset and wrong lazy loading on the LCP (see `asset-pipeline`).

## Approval checklist

Answer yes/no. Any "no" blocks the handoff to Motion QA (`qa-motion-adversarial`, via `motion-qa`); the Producer (`producer-orquestrador`) re-verifies the vitals and budget items in the Release Readiness Report / Release Checklist.

- [ ] RSC by default and `"use client"` only at leaves — no `page.tsx`/`layout.tsx` marked client?
- [ ] First-load JS ≤ 300 KB gzip measured in `@next/bundle-analyzer`/`next build`, AND the SEPARATE total-JS budget (`resource-summary:script:size` ≤ 300 KB, the stricter proxy) enforced in `@lhci/cli`?
- [ ] Lighthouse 100 across all 4 categories in CI (`minScore: 1`), on the median of 3 runs?
- [ ] LCP < 2.5 s, CLS < 0.1 (target ≈ 0), INP < 200 ms in the field + TBT < 200 ms in the lab — the SAME thresholds as `perf-a11y-motion`?
- [ ] LCP image unique with `priority` + `sizes` + dimensions; `formats: ['image/avif','image/webp']` in the right order; no other image with `priority`?
- [ ] Fonts only via `next/font` (`size-adjust`, `display: swap`), zero external font `<link>`/`@import`?
- [ ] Does every `dynamic(ssr:false)` live inside a `"use client"` wrapper imported by the server?
- [ ] Third-party on `lazyOnload` or a facade; nothing third-party on first paint; heavy embeds via a facade?
- [ ] Does Tailwind's `content` cover every file; zero concatenated class; `safelist` only for what's generated at runtime?
- [ ] Streaming with `<Suspense>` (or `loading.tsx`) below the fold; hero outside every boundary and legible with no JS; skeleton with the same box?
- [ ] `immutable` cache on hashed assets + `minimumCacheTTL` on the optimizer; security headers present; CSP tested or its absence justified in the Perf Report?
- [ ] Metadata (title + description + canonical), native `robots.ts`, `sitemap.ts`, and JSON-LD (`schema-dts`, `<` escaped, from a Server Component) present and valid?
- [ ] Perf Report generated (Lighthouse CI + `@next/bundle-analyzer` + `web-vitals` p75) and attached to the QA Report?
</content>
