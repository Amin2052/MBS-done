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
| M0 | Bootstrap & environment | done-verified | `docs/milestones/M00.md`; 24 requirements traced |
| M1 | Read-only audit | done-verified for source outputs; 8 outputs blocked | `docs/milestones/M01.md`; 12 audit reports in `docs/audit/` |
| M2 | Architecture, spikes, design system | blocked on owner scope decisions | — |
| M3..M15 | see spec Part 17 | not-started | — |

Status vocabulary: `not-started | in-progress | done-verified | blocked` (spec 1.5).

## Decisions taken on the owner's behalf

| Date | Decision | Class | Note |
|---|---|---|---|
| 2026-11-21 | Pin `c2871d2…` as `OLD_BASELINE_SHA` | D1 | Recorded in `docs/audit/old-baseline.txt` |
| 2026-11-21 | Keep the 0.2 directory names | D1 | No audit evidence contradicts them |
| 2026-11-21 | Land files through the GitHub API while no git credential exists | D1 | Recorded in H-01 |
| 2026-11-21 | Report ASVS at chapter level until the official CSV is ingested | D1 | `asvs-5.0-checklist.csv` marks this |
| 2026-11-21 | Treat suppliers / purchases / expenses as new features, not parity work | D1 | `decision-on-owner-behalf, review later` — see R3 |
| 2026-11-21 | Do not reproduce a 67 KB spec from memory; keep a pointer | D1 | H-03 |

## Open questions

- **Scope:** are suppliers, purchases and expenses required in v1, given OLD has none?
- Are certificates, messages, backup/restore and licence UI carried into the SaaS, or
  replaced by platform features / dropped?
- Keep, drop, or keep-for-testing the legacy Arabic locale?
- Should `MBS-done` stay public?
- Is `mooral-main` still the only live tenant?
