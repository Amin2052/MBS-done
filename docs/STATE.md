# MBS State

> Single resume point (spec 1.4). Keep this under 80 lines. Update after every work unit.

**Updated:** 2026-11-21 (session 1, continued)
**Current milestone:** M2 — architecture and decisions done; RLS spike passes; three
spikes blocked by the environment
**Branch:** `main`, no feature branch yet
**OLD_BASELINE_SHA:** `c2871d272428e65db055d49e31e53c41dc87706f`
**NEW repository:** https://github.com/Amin2052/MBS-done.git — **public**

## Done

- M0: structure, guards, CI check, state files.
- M1: 12 audit reports (screens, components, dependencies, parity, security/ASVS, ER,
  risks, offline, DB inventory, architecture, repository, manifest).
- M2: ADR-0001…0014, design tokens, STRIDE threat model, and a **passing RLS spike**
  (7/7) on PGlite as an unprivileged role.

## Next 3 actions

1. Re-run the blocked spikes on a machine with Docker or a managed Postgres:
   one-connection-pool concurrency, Kysely interactive transactions.
2. Bangla PDF spike: fetch Playwright Chromium + Noto Sans Bengali, render the tricky
   conjunct corpus, compare hashes and `pdftotext` round trip.
3. Start M3 foundation: `platform`/`tenant` schemas, migration role vs `app_runtime`,
   RLS CI checks (tenant_id, FORCE, four policies, `security_invoker` views), i18n
   catalogs wired, `packages/domain` money helpers, audit-log primitive.

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
