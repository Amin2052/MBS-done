# MBS Progress

> Short by design (spec Part 18). Incidents first, then status, then decisions and open
> questions. Detail lives in `docs/milestones/Mxx.md`.

## INCIDENTS

None.

_Old-repo integrity is re-checked at every milestone exit: `git -C old-src status
--porcelain` empty and the before/after manifest diff identical._

## Milestone status

| # | Milestone | Status | Evidence |
|---|---|---|---|
| M0 | Bootstrap & environment | done-verified | `docs/milestones/M00.md` |
| M1 | Read-only audit | done-verified (source outputs); 8 blocked | `docs/milestones/M01.md` |
| M2 | Architecture, decisions, spikes | in-progress — ADRs + tokens + RLS spike done; pool/ORM/PDF/email spikes open | `docs/milestones/M02.md`, `docs/adr/` |
| M3 | Foundation (tenancy, audit log, money) | done-verified — schema 42/42 after the M4 migration; money 10/10 | `docs/milestones/M03.md`, `docs/milestones/M04.md` |
| M4 | Auth, sessions, API v1 | in-progress — runner, login/session/logout, 6 routes green; MFA, Kysely, pool concurrency open | `docs/milestones/M04.md`, ADR-0015 |
| M5 | Owner portal: sign in, business profile | in-progress — both screens built, bn/en, 65 tests + typecheck + build green; further screens and MFA open | `docs/milestones/M05.md`, ADR-0016 |

## Decisions taken on the owner's behalf

| Date | Decision | Class | Note |
|---|---|---|---|
| 2026-11-21 | Node + PostgreSQL 18, not Workers/Hyperdrive | D1 | ADR-0001 |
| 2026-11-21 | Kysely + `pg`, `withTenant()` transaction helper | D1 | ADR-0002 |
| 2026-11-21 | NUMERIC(19,4) + decimal strings | D1 | ADR-0003 |
| 2026-11-21 | Argon2id + TOTP/passkeys + recovery codes | D1 | ADR-0004 |
| 2026-11-21 | Chromium for Bangla PDFs | D1 | ADR-0005 |
| 2026-11-21 | Postgres-backed job queue | D1 | ADR-0007 |
| 2026-11-21 | v1 scope: suppliers/purchases/expenses out; certificates/messages/audit in; licence + `ar` out | D1 | ADR-0011, review later |
| 2026-11-21 | Singapore region, conservative PDPO posture | D2 | ADR-0012, `NEEDS-PROFESSIONAL-REVIEW` |
| 2026-11-21 | Email/SMS vendor deferred to a delivery spike | D1 | ADR-0013 (Proposed) |
| 2026-11-21 | Generated RLS policy loop + static checker as the tenancy gate | D1 | M03 |
| 2026-11-21 | Session/membership resolution through two SELECT-only capability policies; identity through named SECURITY DEFINER functions | D1 | ADR-0015 |
| 2026-11-21 | Login throttle keyed by sha256(email) with 5-failure / 15-minute lock | D1 | M04 |
| 2026-11-21 | hash-wasm for Argon2id instead of a native binding (no compiler in deploy) | D1 | M04 |
| 2026-11-21 | Owner portal is React + Vite, static, served same-origin by the API; no router until the third screen | D1 | ADR-0016 |
| 2026-11-21 | i18n gate is `tools/check-i18n.mjs` instead of ESLint `no-restricted-syntax` | D1 | M05, deviation from ADR-0008 |
| 2026-11-21 | Bangla uses the device font for now; self-hosted Noto Sans Bengali deferred | D1 | binary cannot be pushed (H-05) |

## Open questions

- Owner confirmation of ADR-0011's scope calls (the agent decided; none block work).
- Email sending domain and DNS for SPF/DKIM/DMARC (HUMAN-REQUIRED).
- Whether the owner wants a Bangladesh-region deployment after the PDPO review.
