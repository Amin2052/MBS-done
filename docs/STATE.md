# MBS State

> Single resume point (spec 1.4). Keep this under 80 lines. Update after every work unit.

**Updated:** 2026-11-21 (session 1, continued)
**Current milestone:** M3 — foundation schema, tenancy checks and money module done and
verified; auth/API layer next
**Branch:** `main`, no feature branch yet
**OLD_BASELINE_SHA:** `c2871d272428e65db055d49e31e53c41dc87706f`
**NEW repository:** https://github.com/Amin2052/MBS-done.git — **public**

## Done

- M0: structure, guards, CI check, state files.
- M1: 12 audit reports (screens, components, dependencies, parity, security/ASVS, ER,
  risks, offline, DB inventory, architecture, repository, manifest).
- M2: ADR-0001…0014, design tokens, STRIDE threat model, and a passing RLS spike (7/7)
  on PGlite as an unprivileged role.
- M3: `db/migrations/0001_foundation.sql` (platform/tenant schemas, `mbs_migrator` vs
  `app_runtime`, 5 tenant tables, generated RLS policies, append-only audit log, gapless
  counters, identity reachable only through a SECURITY DEFINER function);
  `tools/check-rls.mjs` (static), `tools/verify-schema.mjs` (32/32 dynamic checks);
  `packages/domain/src/money.ts` + tests; bn/en catalogs.

## Next 3 actions

1. M4: migration runner with checksums, session/auth wiring on the foundation tables
   (`withTenant`, `platform.user_by_email`, Argon2id, TOTP), and the first `/api/v1`
   routes with OpenAPI generation.
2. Re-run the blocked spikes on a machine with Docker or a managed Postgres:
   one-connection-pool concurrency, Kysely interactive transactions.
3. Bangla PDF spike: fetch Playwright Chromium + Noto Sans Bengali, render the tricky
   conjunct corpus, compare hashes and `pdftotext` round trip.

Verification for everything above: `npm run verify` (repo, RLS static, schema dynamic,
money tests).

## Blockers

- **Push credential (H-01).** Large payloads cannot be pushed; text files go through the
  API in small batches.
- **Docker/PostgreSQL.** No socket access, no sudo, no local server → pool and ORM spikes
  are blocked in this environment.
- **Playwright/Chromium + fonts** not yet fetched → Bangla PDF corpus spike pending.
- **Real legacy databases (H-04)** still missing → ETL and rounding proof blocked.

## Decisions taken (summary)

ADR-0001 Node + PostgreSQL 18 (not Workers/Hyperdrive) · ADR-0002 Kysely + pg ·
ADR-0003 NUMERIC(19,4) + decimal.js · ADR-0004 Argon2id + TOTP/passkeys ·
ADR-0005 Chromium PDF · ADR-0006 S3-compatible storage · ADR-0007 Postgres job queue ·
ADR-0008 ICU i18n (bn/en) · ADR-0009 REST `/api/v1` + OpenAPI · ADR-0010 online-only web,
legacy desktop for offline · ADR-0011 v1 scope · ADR-0012 Singapore + conservative PDPO ·
ADR-0013 email/SMS pending spike · ADR-0014 threat model.

## Pending NEEDS-PROFESSIONAL-REVIEW

- PDPO/data residency (ADR-0012).
- Mushak 6.3 template and retention (Part 10.3).
- Money rounding rule (ADR-0003).
- ASVS requirement-level scoring.
