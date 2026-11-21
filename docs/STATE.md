# MBS State

> Single resume point (spec 1.4). Keep this under 80 lines. Update after every work unit.

**Updated:** 2026-11-21 (session 1)
**Current milestone:** M0 — Bootstrap & environment (in progress), M1 audit started
**Branch:** `main` (bootstrap), no feature branch yet
**Last commit:** `0b0442c` (M0 bootstrap, local — not pushed, see Blockers)
**OLD_BASELINE_SHA:** `c2871d272428e65db055d49e31e53c41dc87706f`
**NEW repository:** https://github.com/Amin2052/MBS-done.git — **public**, empty before bootstrap

## Done this session

- Cloned OLD read-only (`old-src/`, `--depth 1`, push URL set to `DISABLED`); verified
  `git status --porcelain` is empty.
- Generated `docs/audit/old-manifest-before.csv` (338 files, 8,968,812 bytes,
  manifest sha256 `63827bba84f8d322527f592e9e5f61484150627366b106931b2f5944ff5dd6ec`).
- Created the 0.2 directory skeleton, `tools/manifest.mjs`, `tools/guard.mjs`.
- Wrote AGENTS.md, README, .gitignore, .gitattributes, STATE/PROGRESS/human-required,
  requirements.csv seed, and the first three M1 audit reports.

## Next 3 actions

1. Push-credential gap: M0 is committed locally and exported as `MBS-done-M0.bundle`
   (git history) plus `MBS-done-M0-bootstrap.zip` (working tree). With H-01's token,
   `git push origin main` lands it as one clean commit (see H-01).
2. Finish the M1 audit outputs listed in `docs/milestones/M00.md` (screen inventory,
   dependency graph, parity matrix, security audit, offline dependence final).
3. Start M2 spikes only after M1 outputs exist: RLS + one-connection pool, ORM
   transaction behaviour, Bangla PDF corpus, email/SMS delivery.

## Blockers

- **Push credentials.** No git credential for `MBS-done` (`gh` is unauthenticated, no
  token in the environment). Work is committed locally (`0b0442c`) and exported as a
  bundle + zip. Recorded as H-01 and R-007 (`blocked`).
- **Real legacy databases.** Only the schema in OLD is available; ETL fixtures are
  synthetic until H-04 supplies anonymised copies.
- **`docs/spec/MASTER_V6.md` is a pointer, not the verbatim spec** — the source is the
  owner's attached `MBS_MASTER_PROMPT_V6_2_GITHUB.md` (67,615 bytes). Restore it
  verbatim in the next session (see the file itself).

## Pending NEEDS-PROFESSIONAL-REVIEW

- PDPO compliance map and data-residency (Part 10.2).
- Mushak 6.3 template and retention period (Part 10.3).
- Legacy money-rounding rules (Part 11.2).
