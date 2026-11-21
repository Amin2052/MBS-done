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
| M3 | Foundation (tenancy, audit log, money) | in-progress — schema + checks green (32/32); auth/API layer pending | `docs/milestones/M03.md` |
| M4 | Auth, sessions, API v1 | not-started | — |

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

## Open questions

- Owner confirmation of ADR-0011's scope calls (the agent decided; none block work).
- Email sending domain and DNS for SPF/DKIM/DMARC (HUMAN-REQUIRED).
- Whether the owner wants a Bangladesh-region deployment after the PDPO review.
