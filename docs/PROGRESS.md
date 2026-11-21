# MBS Progress

> Short by design (spec Part 18). Incidents first, then status, then decisions and open
> questions. Detail lives in `docs/milestones/Mxx.md`.

## INCIDENTS

None.

_Old-repo integrity is re-checked at every milestone exit. Emptiness of
`git -C old-src status --porcelain` and the manifest diff are the evidence._

## Milestone status

| # | Milestone | Status | Evidence |
|---|---|---|---|
| M0 | Bootstrap & environment | in-progress | `docs/milestones/M00.md` |
| M1 | Read-only audit | in-progress | `docs/audit/repository-inventory.md`, `architecture-report.md`, `db-inventory.md` |
| M2..M15 | see spec Part 17 | not-started | — |

Status vocabulary: `not-started | in-progress | done-verified | blocked` (spec 1.5).

## Decisions taken on the owner's behalf

| Date | Decision | Class | Note |
|---|---|---|---|
| 2026-11-21 | Read OLD at `c2871d2…` as the pinned baseline | D1 | Only `main` tip available at bootstrap; recorded in `docs/audit/old-baseline.txt` |
| 2026-11-21 | Keep the 0.2 directory names unchanged | D1 | No ADR needed — no audit evidence yet contradicts them |
| 2026-11-21 | Record `docs/spec/MASTER_V6.md` as a pointer to the owner's attachment | D1 | Avoids an unverifiable "verbatim" reproduction; the owner's file is authoritative |

## Open questions

- Should `MBS-done` stay public? It was created public and is empty of project code at
  bootstrap. Spec 0.1 assumes public and forbids real data either way.
- Is `mooral-main` the only live tenant today? `0002_workspace_isolation.sql` seeds
  exactly one workspace; the owner should confirm no second tenant was hand-provisioned.
- The `Generator` sub-app and the `mbs-user` employee app both carry their own build
  config and lockfiles — confirm both are in scope for parity (M1 continues this).
