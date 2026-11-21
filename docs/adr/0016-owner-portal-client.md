# ADR-0016 — Owner portal client: React + Vite SPA served by the API

**Status:** Accepted · **Date:** 2026-11-21 · **Class:** D1 · **Reversibility:** medium

## Context

M5 starts the first screen a business owner sees. Three portals are planned (owner,
employee, admin — ADR-0011), all behind authentication, all consuming the same `/api/v1`
contract (ADR-0009). Spec 9 fixes the design tokens, requires bn/en from the first screen,
and rules out per-page stylesheets. No client framework had been chosen yet.

## Options considered

| Option | Assessment |
|---|---|
| Next.js (App Router) | Excellent SSR/SEO story, but every screen is authenticated and data comes from the API, so SSR buys little; it adds a server runtime, a second cache and a deployment target. |
| Remix / React Router framework | Good data-loading model; still a server process to run and secure next to the API. |
| **React 19 + Vite 8, static build** | One static bundle, no second server, same-origin cookie, fast builds, and the team already writes TypeScript. |
| No framework (templates + islands) | Fine for two screens, but the ERP has dozens of stateful tables and forms; hand-written DOM code becomes the legacy app again. |

## Decision

- **React 19 + TypeScript, built by Vite 8** into `apps/web/dist`.
- The API serves that directory when `MBS_WEB_ROOT` is set, so the portal and `/api/v1`
  share an origin. That keeps the session cookie `SameSite=Strict`, `HttpOnly`, and needs no
  CORS allow-list or token in JavaScript.
- One CSP for the portal (`default-src 'self'`), separate from the API's `default-src 'none'`.
- **No router yet.** The session state is the route: signed out → sign-in, signed in →
  profile. A router (`react-router` or a small history hook) is added with the third screen,
  not before it.
- **No client state library.** Server data is fetched per screen; there is no cache to
  invalidate yet.
- **i18n** uses the shared `packages/config/i18n` catalogs through `@formatjs/intl` (ADR-0008).
  The screen never formats a number or a date itself: `packages/config/i18n/core.ts` owns
  digit choice, lakh/crore grouping and `Asia/Dhaka`.
- **The language choice** is `?lang=` → `localStorage` → browser, in that order, and outbound
  API errors are translated by code, never shown as the server's English sentence.
- **No business id ever leaves the client.** Login may carry a slug, and only after the
  server itself returned the list of businesses the account may open.
- **Bangla typeface** prefers the device's own face (Noto Sans Bengali, Nirmala UI, Hind
  Siliguri, SolaimanLipi) with `system-ui` last. A self-hosted `Noto Sans Bengali` (SIL OFL)
  with `unicode-range` remains the intended end state, but it is a binary asset this
  session's text-only push channel cannot carry; it is recorded as an M05 limitation.

## Consequences

- `npm run verify` now needs a client build (`vite build apps/web`), and CI must install the
  root dependencies. This is the first build step in the repo.
- `apps/web` imports TypeScript from `packages/` across the app boundary; Vite's
  `server.fs.allow` is widened to the repository root for development only.
- No SSR means no per-request HTML: the shell paints, then `/api/v1/me` decides. Acceptable
  behind a login and on the speed of a Bangladeshi 4G connection; the bundle is ~90 KiB gzip.
- If a public marketing site or SEO-rendered page is ever needed, it is a separate app — not
  this one.
- The portal's CSP must be revisited when fonts, images or a CDN are added; `connect-src`
  stays `'self'`.

## Sources

- https://vite.dev/guide/ (checked 2026-11-21)
- https://react.dev/reference/react (checked 2026-11-21)
- https://fonts.google.com/noto/specimen/Noto+Sans+Bengali (checked 2026-11-21; bundling
  deferred, see M05)
