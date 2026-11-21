# Mooral Business Suite — SaaS (NEW)

Multi-tenant business-management SaaS for Bangladesh, built incrementally from the
existing MBS desktop application. Bangla + English, BDT, Asia/Dhaka.

| | |
|---|---|
| Legacy source (read-only) | https://github.com/Amin2052/MBS.git |
| Pinned baseline | `c2871d272428e65db055d49e31e53c41dc87706f` (`docs/audit/old-baseline.txt`) |
| This repository | https://github.com/Amin2052/MBS-done.git |
| Specification | `docs/spec/MASTER_V6.md` (owner's master prompt V6.2) |

## Start here

1. `AGENTS.md` — rules every session must follow.
2. `docs/STATE.md` — the single resume point.
3. `docs/PROGRESS.md` — milestone status and incidents.
4. `docs/human-required.md` — what only the owner can do.

## Layout (spec 0.2)

```
apps/        owner-portal | employee-portal | admin-portal | api
packages/    domain | ui | config | contracts
db/          migrations | policies
migration/   etl | profiling | reports   (source-copies/ is git-ignored)
tests/       unit | integration | e2e | security | visual | load
infra/       IaC, CI/CD, runbooks
tools/       guard, manifest, repo checks
docs/        audit | adr | design-system | runbooks | spec | milestones
desktop/     Electron shell (later, M12)
_work/       git-ignored scratch
```

## Working with the legacy repository

`old-src/` is a read-only clone created by `git clone --depth 1`, with
`git remote set-url --push origin DISABLED`. It is never edited, built, tested or
committed to. Its git-ignored `_work/old-copy/` export is where any legacy build
or test run happens.

Regenerate the legacy file manifest at any time:

```bash
node tools/manifest.mjs --repo ../old-src --ref HEAD --out docs/audit/old-manifest-after.csv
```

Verify the legacy clone is untouched (must print nothing):

```bash
git -C ../old-src status --porcelain
git -C ../old-src diff --stat c2871d272428e65db055d49e31e53c41dc87706f
```
