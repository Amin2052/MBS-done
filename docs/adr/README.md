# Architecture Decision Records

Spec Part 5.9 requires an ADR per significant decision, each with options, sources and
dates, the decision, and reversibility. Decisions here were taken under spec 1.1:

- **D1** (technical, reversible) — decided and logged.
- **D2** (legal/tax/financial/privacy) — safest conservative option, tagged
  `NEEDS-PROFESSIONAL-REVIEW`.
- **D3** (irreversible/real-world) — prepared only, never executed.

## Index

| ADR | Decision | Class | Status |
|---|---|---|---|
| [0001](0001-hosting-and-database.md) | Hosting model and database engine/version | D1 | Accepted |
| [0002](0002-data-access.md) | Data access layer (ORM/driver/transaction helper) | D1 | Accepted |
| [0003](0003-money.md) | Money representation and rounding | D1 + D2 tag | Accepted |
| [0004](0004-authentication.md) | Authentication, sessions, MFA | D1 | Accepted |
| [0005](0005-pdf-engine.md) | PDF rendering and Bangla shaping | D1 | Accepted |
| [0006](0006-file-storage.md) | File storage | D1 | Accepted |
| [0007](0007-jobs.md) | Background jobs and queues | D1 | Accepted |
| [0008](0008-i18n.md) | Internationalisation and locale data | D1 | Accepted |
| [0009](0009-api-versioning.md) | API style and versioning | D1 | Accepted |
| [0010](0010-offline-strategy.md) | Offline behaviour and legacy desktop coexistence | D1 | Accepted |
| [0011](0011-scope-decisions.md) | v1 module scope (suppliers/purchases/expenses, certificates, messages, backup, licence, `ar`) | D1 | Accepted, review later |
| [0012](0012-data-residency-and-pdpo.md) | Data residency and PDPO posture | D2 | Accepted, `NEEDS-PROFESSIONAL-REVIEW` |
| [0013](0013-email-and-sms.md) | Email and SMS delivery | D1 pending spike | Proposed |
| [0014](0014-threat-model.md) | STRIDE threat model | D1 | Accepted |
| [0015](0015-auth-and-session-resolution.md) | Authentication, session resolution and pre-auth capabilities | D1 | Accepted |
| [0016](0016-owner-portal-client.md) | Owner portal client stack and same-origin hosting | D1 | Accepted |
| [0017](0017-second-factor.md) | Second factor: mandatory TOTP for owners and managers, recovery codes, sealed secrets | D1 | Accepted |

## Format

```
# ADR-NNNN — title
Status · Date · Class · Reversibility
## Context
## Options considered
## Decision
## Consequences
## Sources (URL + date checked)
```

## Facts used (checked 2026-11-21)

| Fact | Source |
|---|---|
| PostgreSQL 18.7 is the current supported release (2026-11-12); 18 is supported to 2030-11-14, 14 reached EOL 2026-11-12 | postgresql.org/docs/18/release-18-7.html; endoflife.date/postgresql |
| Electron stable is 45.3.4 (Nov 2026); only 43/44/45 are supported; 42 ended 2026-10-20 | releases.electronjs.org; endoflife.date/electron |
| OWASP: Argon2id minimum 19 MiB, t=2, p=1; scrypt minimum N=2^17, r=8, p=1 | cheatsheetseries.owasp.org/Password_Storage_Cheat_Sheet |
| Hyperdrive is transaction-mode pooling; `SET` applies per transaction/query and is reset when returned; no session advisory locks, no SQL-level PREPARE/EXECUTE, no LISTEN/NOTIFY; transaction-level advisory locks are supported | developers.cloudflare.com/hyperdrive/concepts/connection-pooling; .../reference/supported-databases-and-features |
