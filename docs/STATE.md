# MBS State

> Single resume point (spec 1.4). Keep this under 80 lines. Update after every work unit.

**Updated:** 2026-11-21 (session 1, continued — M5)
**Current milestone:** M5 — the owner portal's sign-in and business-profile screens are
built in Bangla and English and verified; MFA, the remaining screens and the blocked
infrastructure spikes are next
**Branch:** `main`, no feature branch yet
**OLD_BASELINE_SHA:** `c2871d272428e65db055d49e31e53c41dc87706f`
**NEW repository:** https://github.com/Amin2052/MBS-done.git — **public**

## Done

- M0: structure, guards, CI check, state files.
- M1: 12 audit reports (screens, components, dependencies, parity, security/ASVS, ER,
  risks, offline, DB inventory, architecture, repository, manifest).
- M2: ADR-0001…0016, design tokens, STRIDE threat model, passing RLS spike (7/7).
- M3: `db/migrations/0001_foundation.sql` (platform/tenant schemas, 5 tenant tables,
  generated RLS, append-only audit log, gapless counters, identity via functions);
  `tools/check-rls.mjs`, `tools/verify-schema.mjs` (42/42), money module, bn/en catalogs.
- M4: checksummed migration runner; `0002_auth.sql` (login throttle keyed by email hash,
  five definer functions, two SELECT-only capability policies); Argon2id + opaque sessions;
  six `/api/v1` routes and the generated OpenAPI document.
- M5: `apps/web` owner portal (React 19 + Vite, ADR-0016) with sign-in (invalid, locked,
  offline, multi-business chooser) and business profile (role-gated editing, changed-field
  PATCH, unsaved guard); 85 message ids in each catalog; `packages/config/i18n/core.ts`
  (ICU via `@formatjs/intl`, bn/latin digits, lakh grouping, Asia/Dhaka);
  `tools/check-i18n.mjs` gate; portal served by the API at the same origin
  (`MBS_WEB_ROOT`) with its own CSP; `tools/dev-api.mjs` demo stack.

## Next 3 actions

1. MFA: TOTP enrolment + recovery codes on `platform.users.mfa_enrolled_at`, then session
   list / revoke-all.
2. M6: the next owner screens (dashboard shell and navigation) and the router decision
   ADR-0016 deliberately deferred.
3. Re-run the blocked spikes on a machine with Docker or a managed Postgres: pool
   concurrency, Kysely interactive transactions, then the Bangla PDF spike.

Verification: `npm run verify` (repo, static RLS, i18n, schema 42/42, typecheck, portal
build, 65 tests). Portal: `npm run dev:api` + `npm run dev:web`.

## Blockers

- **Push credential (H-01).** Text files go through the GitHub API in batches; binary files
  cannot be pushed at all, which is why the Bangla webfont is not yet committed.
- **Docker/PostgreSQL.** No socket access, no sudo, no local server → pool and ORM spikes
  are blocked. The `pg` adapter remains unexercised.
- **Playwright/Chromium + fonts** not fetched → Bangla PDF corpus spike pending.
- **Real legacy databases (H-04)** still missing → ETL and rounding proof blocked.

## Decisions taken (summary)

ADR-0001 Node + PostgreSQL 18 · ADR-0002 Kysely + pg · ADR-0003 NUMERIC(19,4) + decimal.js ·
ADR-0004 Argon2id + TOTP/passkeys · ADR-0005 Chromium PDF · ADR-0006 S3 storage ·
ADR-0007 Postgres job queue · ADR-0008 ICU i18n (bn/en) · ADR-0009 REST `/api/v1` + OpenAPI ·
ADR-0010 online-only web, legacy desktop offline · ADR-0011 v1 scope · ADR-0012 Singapore +
PDPO · ADR-0013 email/SMS pending spike · ADR-0014 threat model · ADR-0015 pre-auth
capabilities · ADR-0016 React + Vite SPA served same-origin by the API.

## Pending NEEDS-PROFESSIONAL-REVIEW

- PDPO/data residency (ADR-0012).
- Mushak 6.3 template and retention (Part 10.3).
- Money rounding rule (ADR-0003).
- ASVS requirement-level scoring.
