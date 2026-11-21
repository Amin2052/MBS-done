# MBS State

> Single resume point (spec 1.4). Keep this under 80 lines. Update after every work unit.

**Updated:** 2026-11-21 (session 1, continued — M4)
**Current milestone:** M4 — migration runner, login/sessions/logout and the first six
`/api/v1` routes are verified; MFA, Kysely wiring and pool concurrency remain
**Branch:** `main`, no feature branch yet
**OLD_BASELINE_SHA:** `c2871d272428e65db055d49e31e53c41dc87706f`
**NEW repository:** https://github.com/Amin2052/MBS-done.git — **public**

## Done

- M0: structure, guards, CI check, state files.
- M1: 12 audit reports (screens, components, dependencies, parity, security/ASVS, ER,
  risks, offline, DB inventory, architecture, repository, manifest).
- M2: ADR-0001…0015, design tokens, STRIDE threat model, passing RLS spike (7/7) on
  PGlite as an unprivileged role.
- M3: `db/migrations/0001_foundation.sql` (platform/tenant schemas, `mbs_migrator` vs
  `app_runtime`, 5 tenant tables, generated RLS policies, append-only audit log, gapless
  counters, identity reachable only through a SECURITY DEFINER function);
  `tools/check-rls.mjs` (static), `tools/verify-schema.mjs` (now 42/42); money module and
  bn/en catalogs.
- M4: `packages/data/src/migrator.ts` + `tools/migrate.mjs` (contiguous versions, one
  transaction per file, sha256 ledger in `mbs_meta.schema_migrations`, drift fails the run);
  `db/migrations/0002_auth.sql` (login throttle keyed by email hash, lookup/profile/tenant
  functions, two SELECT-only capability policies); Argon2id + opaque session tokens;
  `POST /auth/login`, `POST /auth/logout`, `GET /me`, `GET|PATCH /org`, `GET /health`,
  `GET /openapi.json`. Tests: money 10/10, auth 9/9, migrator 5/5, api 14/14.

## Next 3 actions

1. M4 remainder: TOTP + recovery codes on `platform.users.mfa_enrolled_at`, then session
   list / revoke-all.
2. M5: first owner screens against `/api/v1` (login, business profile), i18n wired.
3. Re-run the blocked spikes on a machine with Docker or a managed Postgres: one-connection
   pool concurrency, Kysely interactive transactions, then Bangla PDF spike
   (Playwright Chromium + Noto Sans Bengali, hash + `pdftotext` round trip).

Verification for everything above: `npm run verify` (repo, RLS static, schema 42/42, four
suite run). Migration CLI: `npm run migrate -- --status|--check|--dry-run`.

## Blockers

- **Push credential (H-01).** Large payloads cannot be pushed; text files go through the
  API in small batches.
- **Docker/PostgreSQL.** No socket access, no sudo, no local server → pool and ORM spikes
  are blocked in this environment. The API's `pg` adapter is therefore unexercised.
- **Playwright/Chromium + fonts** not yet fetched → Bangla PDF corpus spike pending.
- **Real legacy databases (H-04)** still missing → ETL and rounding proof blocked.

## Decisions taken (summary)

ADR-0001 Node + PostgreSQL 18 (not Workers/Hyperdrive) · ADR-0002 Kysely + pg ·
ADR-0003 NUMERIC(19,4) + decimal.js · ADR-0004 Argon2id + TOTP/passkeys ·
ADR-0005 Chromium PDF · ADR-0006 S3-compatible storage · ADR-0007 Postgres job queue ·
ADR-0008 ICU i18n (bn/en) · ADR-0009 REST `/api/v1` + OpenAPI · ADR-0010 online-only web,
legacy desktop for offline · ADR-0011 v1 scope · ADR-0012 Singapore + conservative PDPO ·
ADR-0013 email/SMS pending spike · ADR-0014 threat model · ADR-0015 pre-auth capabilities.

## Pending NEEDS-PROFESSIONAL-REVIEW

- PDPO/data residency (ADR-0012).
- Mushak 6.3 template and retention (Part 10.3).
- Money rounding rule (ADR-0003).
- ASVS requirement-level scoring.
