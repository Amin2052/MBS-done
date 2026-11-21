# MBS State

> Single resume point (spec 1.4). Keep this under 80 lines. Update after every work unit.

**Updated:** 2026-11-22 (session 2 — M7)
**Current milestone:** M7 — the owner shell has a router, a sidebar limited to screens that
exist, and a dashboard fed by a tenant-scoped endpoint; session list, permission-driven
navigation and the first ERP module are next
**Branch:** `main`, no feature branch yet
**OLD_BASELINE_SHA:** `c2871d272428e65db055d49e31e53c41dc87706f`
**NEW repository:** https://github.com/Amin2052/MBS-done.git — **public**

## Done

- M0: structure, guards, CI check, state files.
- M1: 12 audit reports (screens, components, dependencies, parity, security/ASVS, ER,
  risks, offline, DB inventory, architecture, repository, manifest).
- M2: ADR-0001…0018, design tokens, STRIDE threat model, passing RLS spike (7/7).
- M3: `db/migrations/0001_foundation.sql` (platform/tenant schemas, 5 tenant tables,
  generated RLS, append-only audit log, gapless counters, identity via functions);
  `tools/check-rls.mjs`, `tools/verify-schema.mjs`, money module, bn/en catalogs.
- M4: checksummed migration runner; `0002_auth.sql` (login throttle, five definer
  functions, two SELECT-only capability policies); Argon2id + opaque sessions;
  `/api/v1` routes and the generated OpenAPI document.
- M5: `apps/web` owner portal (React 19 + Vite, ADR-0016): sign-in and business profile.
- M6: `0003_mfa.sql` + `0004_login_clock.sql`; mandatory TOTP + ten recovery codes for
  owner/manager, enrolment inside sign-in, sealed secrets, `npm run mfa:code`; 141
  messages now (bn/en).
- M7: ADR-0018; dependency-free History router (`/`, `/profile`, not-found); sidebar with
  active state and mobile strip; `GET /api/v1/dashboard` (profile, active team by role,
  last 10 audit entries, own session) with loading/error/empty states. 96 tests.

## Next 3 actions

1. Session list with revoke-all, then self-service factor reset plus a support runbook.
2. Permission catalogue + invitation flow, so navigation can be permission-derived and
   the Employees screen can exist.
3. Customers module end to end (backend, screen, permissions, isolation test, parity
   checklist) as the template for the remaining ERP modules.

Verification: `npm run verify` (repo, static RLS, i18n 141/141, schema 55/55, typecheck,
portal build, 96 tests). Portal: `npm run dev:api` + `npm run dev:web`.

## Blockers

- **Push credential (H-01).** Text files go through the GitHub API in batches; binary files
  cannot be pushed at all, which is why the Bangla webfont is not yet committed.
- **Docker/PostgreSQL.** No socket access, no sudo, no local server → pool and ORM spikes
  are blocked. The `pg` adapter remains unexercised.
- **Playwright/Chromium + fonts** not fetched → Bangla PDF corpus spike pending.
- **Real legacy databases (H-04)** still missing → ETL and rounding proof blocked.
- **`MBS_MFA_KEY`** must be set in every deployment; losing it invalidates enrolled factors.

## Decisions taken (summary)

ADR-0001 Node + PostgreSQL 18 · ADR-0002 Kysely + pg · ADR-0003 NUMERIC(19,4) + decimal.js ·
ADR-0004 Argon2id + TOTP/passkeys · ADR-0005 Chromium PDF · ADR-0006 S3 storage ·
ADR-0007 Postgres job queue · ADR-0008 ICU i18n (bn/en) · ADR-0009 REST `/api/v1` + OpenAPI ·
ADR-0010 online-only web, legacy desktop offline · ADR-0011 v1 scope · ADR-0012 Singapore +
PDPO · ADR-0013 email/SMS pending spike · ADR-0014 threat model · ADR-0015 pre-auth
capabilities · ADR-0016 React + Vite SPA same-origin · ADR-0017 mandatory TOTP for owners and
managers · ADR-0018 dependency-free history router, nav lists only existing screens.

## Pending NEEDS-PROFESSIONAL-REVIEW

- PDPO/data residency (ADR-0012).
- Mushak 6.3 template and retention (Part 10.3).
- Money rounding rule (ADR-0003).
- ASVS requirement-level scoring.
