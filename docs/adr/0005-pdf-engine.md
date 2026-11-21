# ADR-0005 — PDF rendering and Bangla shaping

**Status:** Accepted · **Date:** 2026-11-21 · **Class:** D1 · **Reversibility:** medium
(templates are engine-agnostic HTML; the renderer can be swapped behind one interface)

## Context

Spec 11.6 is explicit: Bangla is a complex script and many PDF libraries do not shape
conjuncts, reph and vowel signs correctly without a HarfBuzz-class shaping engine. The
legacy product renders through Chromium (Electron `printToPDF` via
`electron/main/pdf-engine.ts`, with `print-preview-modal.tsx` as the UI).

Requirements: one template and one server data source for preview, PDF, print and
regeneration; issued invoices regenerate identically; Bangla + English + ৳ mixed in one
document; text-extraction round trip must yield correct Unicode.

## Options considered

| Option | Assessment |
|---|---|
| pdfkit / pdf-lib with Noto Sans Bengali | Fast, but shaping must be done by the library; without HarfBuzz, conjuncts break. `pdf-lib` alone cannot shape at all. |
| Puppeteer/Playwright Chromium `page.pdf()` with embedded Noto Sans Bengali | Chromium has full HarfBuzz shaping; identical rendering to the browser preview; heavy (needs a Chromium binary, ~150 MB) but runs in a worker, not in a request. |
| WeasyPrint (Python) | Good shaping via Pango, but adds a second runtime to the stack. |
| Headless Chrome via a separate service | Adds infrastructure and a network hop for every invoice. |

## Decision

**Chromium via Playwright** (`chromium.launch()`, `page.pdf()`), rendering HTML from
`packages/domain` templates with **Noto Sans Bengali** and **Inter** embedded as
base64 WOFF2 in the document head (no network fetch during render).

- Rendering runs in the `jobs` worker, never in an HTTP request handler.
- Each issued invoice stores: the canonical JSON snapshot, the HTML hash, the PDF hash,
  the renderer version and the font file hashes.
- Regeneration must be byte-identical for the pinned renderer version + fonts; the test
  compares hashes across two runs and across a process restart.
- Preview, print and PDF all use the same template and the same snapshot.

## Consequences

- CI needs the Playwright Chromium download; the API image grows by ~150 MB.
- Font licensing is recorded in `docs/adr/` (Noto = OFL, Inter = OFL) and checked before
  embedding.
- The acceptance corpus (spec 11.6) is a set of tricky conjuncts + mixed Bangla/English/
  digits/৳, compared visually **and** via `pdftotext` round trip.

## Open item

The corpus and the byte-identical test are M8 work; the engine choice is the M2 exit
criterion and is covered by the spike in `docs/milestones/M02.md`.

## Sources

- https://www.electronjs.org/docs/latest/api/web-contents#contentsprinttopdfoptions (legacy approach, checked 2026-11-21)
- https://playwright.dev/docs/api/class-page#page-pdf (checked 2026-11-21)
- https://fonts.google.com/noto/specimen/Noto+Sans+Bengali (OFL, checked 2026-11-21)
