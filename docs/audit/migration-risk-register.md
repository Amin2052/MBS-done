# Migration risk register — OLD @ `c2871d2`

Scoring: likelihood × impact, both H/M/L. Owner is the role that must act.

| # | Risk | Evidence | L | I | Mitigation | Owner | Status |
|---|---|---|---|---|---|---|---|
| R1 | **Offline dependence** — customers expect the desktop app to work without internet | `package.json` describes an "Offline Desktop" product; local SQLite is primary; backup/restore built in | H | H | Keep legacy desktop for offline businesses until an offline ADR exists; per-business written acceptance of online-only before cutover | Owner + M10 | open |
| R2 | **Money stored as REAL** — rounding drift on migration | `0001` money columns are `REAL`; repeated in `0003` | H | H | `NUMERIC(19,4)` in NEW; record legacy and new value per row; classify every ≥ ৳0.01 difference | M8/M10 | open |
| R3 | **Suppliers, Purchases, Expenses do not exist in OLD** although the prompt lists them for parity | no screens, no repositories, no tables | H | M | Decide: build as new features in v1, or defer with written scope change | Owner | open |
| R4 | **`company_settings` is a physical singleton** | `CHECK (id = 1)` in `0001` | H | H | Recreate table in `0003` on a rehearsed copy before any second tenant | M10 | open |
| R5 | **Global UNIQUE business keys** block a second tenant | `0002` header; `0003` unapplied | H | M | Apply the table-recreation migration with a rehearsed backup | M10 | open |
| R6 | **No declared referential integrity** (2 FKs in 24 tables) | `0001` grep | H | M | Orphan profiling per relationship; decide repair vs quarantine per row | M10 | open |
| R7 | **Two schema sources may already disagree** | `src/database/database.ts` (2,851 lines) vs `0001`+`0002` | M | H | Build the logical model once in `packages/domain`/`db`; diff both sources column by column | M3 | open |
| R8 | **145 IPC handlers in one 110 KB file** hide authorisation gaps | `electron/main/main.ts` | M | H | Do not port the shape; enforce server-side authorisation per endpoint, generated matrix | M4 | open |
| R9 | **No MFA, and legacy reasoning explicitly rejects it** | `i18n` `twoFactorEvaluation` | H | H | Mandatory TOTP/passkeys for Owner and Super Admin; recovery-code path first | M4 | open |
| R10 | **Three apps, two lockfiles, one stale Electron** | `package.json`, `Generator/package.json`, Electron 31 | M | M | One app in NEW; upgrade Electron only in NEW; per-package vulnerability scan at M2 | M2 | open |
| R11 | **Real data unavailable** — ETL only provable against synthetic fixtures today | git has no SQLite file | H | H | H-04 anonymised copies with `-wal`/`-shm`; three rehearsals before cutover | Owner + M10 | blocked |
| R12 | **Licence/activation is commercial IP inside the repo** | `license-v2/*`, `Generator/*` | M | M | Never ship licence logic in the tenant SaaS; keep the legacy app activated until cutover | M5/M12 | open |
| R13 | **Missing architectural rationale** — `.claude` checkpoint referenced but untracked | `wrangler.toml` comment | M | L | Record the tenant-isolation history from what the migrations themselves say | M2 | accepted |
| R14 | **Arabic locale ships but the prompt names only bn + en** | `src/i18n/ar.ts` (1,481 lines) | M | L | Owner decision: keep, drop, or keep for layout testing | Owner | open |
| R15 | **ASVS official checklist not ingested**; security status is chapter-level | `asvs-5.0-checklist.csv` | M | M | Ingest the official CSV at M4 and re-score | M4 | planned |
| R16 | **No dependency vulnerability or licence scan yet** — can't install OLD in place | spec 0.1 rule 2 | M | M | Run `npm audit` + licence scan on `_work/old-copy` export at M2 | M2 | planned |

## Cutover-blocking conditions (all must be true)

1. R2, R4, R5, R6, R11 closed with evidence.
2. Three rehearsals, last one with zero unexplained differences (spec 12.6).
3. Per-business written owner sign-off, legacy authoritative for 30 days after.
4. Offline-dependent businesses either accept online-only in writing or stay on desktop.

## Change log

| Date | Change |
|---|---|
| 2026-11-21 | Register created from the M1 audit (16 risks) |
