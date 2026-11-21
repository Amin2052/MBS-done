# MBS State

> Single resume point (spec 1.4). Keep this under 80 lines. Update after every work unit.

**Updated:** 2026-11-21 (session 1)
**Current milestone:** M0 — Bootstrap & environment (in progress), M1 audit started
**Branch:** `main`, no feature branch yet
**Remote main head:** see `git log -1` (bootstrap landed in 4 commits: `07bc47f`, `992f479`,
`1972b3a`, `86a9481`)
**OLD_BASELINE_SHA:** `c2871d272428e65db055d49e31e53c41dc87706f`
**NEW repository:** https://github.com/Amin2052/MBS-done.git — **public**

## Done this session

- Cloned OLD read-only (`old-src/`, `--depth 1`, push URL set to `DISABLED`); verified
  `git status --porcelain` is empty and the before/after manifests are identical.
- Generated `docs/audit/old-manifest-before.csv` (338 files, 8,968,812 bytes,
  manifest sha256 `63827bba84f8d322527f592e9e5f61484150627366b106931b2f5944ff5dd6ec`).
- Created the 0.2 directory skeleton, `tools/manifest.mjs`, `tools/guard.mjs`,
  `tools/check-repo.mjs`, CI workflow.
- Wrote AGENTS.md, README, .gitignore, .gitattributes, STATE/PROGRESS/human-required,
  requirements.csv (20 rows), ORIGINS, environment, M0 report, and four M1 audit reports.
- Landed the bootstrap on GitHub (21 files) through the API — no git credential exists in
  the session environment.

## Next 3 actions

1. With H-01's token: `git push origin main` lands the generated manifests (one commit
   ahead) and future work can go back to normal commits.
2. Finish the M1 outputs still missing: screen inventory, component inventory, dependency
   graph, module parity matrix, security/ASVS audit, DB relationship diagram, migration
   risk register.
3. Start M2 spikes after M1: RLS + one-connection pool, ORM transaction behaviour,
   Bangla PDF corpus, email/SMS delivery.

## Blockers

- **Push credentials (H-01).** No git credential and `gh` is unauthenticated. The 21
  bootstrap files are on GitHub via the API; the two generated manifest CSVs
  (`docs/audit/old-manifest-*.csv`, ~115 KB total) exceed the API payload and are **not**
  on the remote yet. Regenerate them with `tools/manifest.mjs`, or take them from
  `MBS-done-M0.bundle` / `MBS-done-M0-bootstrap.zip`.
- **Real legacy databases (H-04).** Only schemas are available; ETL fixtures are
  synthetic.
- **`docs/spec/MASTER_V6.md` is a pointer, not the verbatim spec (H-03).** Source is the
  owner's `MBS_MASTER_PROMPT_V6_2_GITHUB.md` (67,615 bytes).

## Pending NEEDS-PROFESSIONAL-REVIEW

- PDPO compliance map and data-residency (Part 10.2).
- Mushak 6.3 template and retention period (Part 10.3).
- Legacy money-rounding rules (Part 11.2).
