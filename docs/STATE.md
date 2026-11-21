# MBS State

> Single resume point (spec 1.4). Keep this under 80 lines. Update after every work unit.

**Updated:** 2026-11-21 (session 1, continued)
**Current milestone:** M1 complete for source-based outputs; M2 not started
**Branch:** `main`, no feature branch yet
**Remote main head:** see `git log -1` (bootstrap + M1 reports landed via the GitHub API)
**OLD_BASELINE_SHA:** `c2871d272428e65db055d49e31e53c41dc87706f`
**NEW repository:** https://github.com/Amin2052/MBS-done.git — **public**

## Done

- OLD cloned read-only, push URL `DISABLED`, manifests identical before/after.
- M0 bootstrap: structure, guards, CI check, state files, 24 requirements traced.
- M1 audit: 12 of the ~24 Part 4 outputs, including every output requested this session —
  screen inventory, component inventory, dependency graph, module parity matrix,
  security audit + ASVS matrix, DB relationship diagram, migration risk register.

## Next 3 actions

1. **Owner scope decisions** (blocking M2 design): are suppliers / purchases / expenses
   in v1? Keep or drop certificates, messages, backup/restore, licence UI? Keep the `ar`
   locale? Answers change the schema and the milestone plan.
2. Run the remaining M1 outputs in `_work/old-copy/` (a `git archive` export, never the
   clone): baseline build/tests, `npm audit`, licence scan, responsive/a11y screenshots,
   installer report.
3. M2: ADRs + spikes — Postgres 18 + forced RLS with a one-connection pool, ORM
   transaction behaviour, Bangla PDF corpus (HarfBuzz vs Chromium), email/SMS delivery,
   hosting decision (Workers+Hyperdrive vs Node).

## Blockers

- **Push credential (H-01).** No git credential; large payloads (the two manifest CSVs)
  are local-only. Small text files land through the API.
- **Real legacy databases (H-04).** ETL and rounding proof need anonymised `mooral.db`
  copies with `-wal`/`-shm`.
- **Verbatim spec (H-03).** `docs/spec/MASTER_V6.md` is still a pointer.
- **Running-app audit items.** Responsive/a11y/installer/DAST need a built copy; they are
  recorded as blocked, not guessed.

## Pending NEEDS-PROFESSIONAL-REVIEW

- PDPO compliance map and data-residency (Part 10.2).
- Mushak 6.3 template and retention period (Part 10.3).
- Legacy money-rounding rules (Part 11.2).
- ASVS requirement-level scoring once the official CSV is ingested.
