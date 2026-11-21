# MBS Progress

> Short by design (spec Part 18). Incidents first, then status, then decisions and open
> questions. Detail lives in `docs/milestones/Mxx.md`.

## INCIDENTS

None.

_Old-repo integrity is re-checked at every milestone exit. Emptiness of
`git -C old-src status --porcelain` and the before/after manifest diff are the evidence._

## Milestone status

| # | Milestone | Status | Evidence |
|---|---|---|---|
| M0 | Bootstrap & environment | in-progress (push credential + verbatim spec open) | `docs/milestones/M00.md`; commits `07bc47f`, `992f479`, `1972b3a`, `86a9481` |
| M1 | Read-only audit | in-progress | `docs/audit/repository-inventory.md`, `architecture-report.md`, `db-inventory.md`, `offline-dependence-report.md` |
| M2..M15 | see spec Part 17 | not-started | — |

Status vocabulary: `not-started | in-progress | done-verified | blocked` (spec 1.5).

## Decisions taken on the owner's behalf

| Date | Decision | Class | Note |
|---|---|---|---|
| 2026-11-21 | Read OLD at `c2871d2…` as the pinned baseline | D1 | Only `main` tip available at bootstrap; recorded in `docs/audit/old-baseline.txt` |
| 2026-11-21 | Keep the 0.2 directory names unchanged | D1 | No audit evidence yet contradicts them |
| 2026-11-21 | Land the bootstrap through the GitHub API (4 commits) | D1 | No git credential in the session; recorded in H-01 |
| 2026-11-21 | Record `docs/spec/MASTER_V6.md` as a pointer to the owner's attachment | D1 | Avoids an unverifiable "verbatim" reproduction; the owner's file is authoritative |

## Open questions

- Should `MBS-done` stay public? It is public now and holds only bootstrap docs and tools.
- Is `mooral-main` the only live tenant today? `0002_workspace_isolation.sql` seeds
  exactly one workspace; confirm no second tenant was hand-provisioned.
- Are `Generator/` (activation keys) and `mbs-user/` (employee app) both in parity scope?
- Keep, drop or keep-for-testing the legacy `ar` locale (the spec names only bn + en)?
