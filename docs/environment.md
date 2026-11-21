# Environment inventory

Recorded 2026-11-21 (session 1). Spec Part 2 requires an inventory before any change, and
a real call to verify each capability.

## Host

| Item | Value |
|---|---|
| OS | Ubuntu 24.04.5 LTS |
| Kernel | Linux 6.1.102 x86_64 |
| Shell | bash |
| Working root | cloud workspace (disposable); NEW clone at `new-repo/`, OLD at `old-src/` |

This is a **Linux cloud workspace**, not the owner's Windows machine. Spec 0.4 (Windows
realities) therefore applies to the owner's local environment, not here — record it there
if the project later moves to a Windows host.

## Verified tool versions

| Tool | Version | Verified by |
|---|---|---|
| Node | v26.13.0 | `node -v` |
| npm | 11.20.0 | `npm -v` |
| Git | 2.43.0 | `git --version` |
| Python | 3.12.3 | `python3 --version` |
| Docker | present (`/usr/bin/docker`) | `command -v docker` |
| GitHub CLI | present (`/usr/bin/gh`) | `command -v gh` |

## Missing or not yet verified

| Need | Status | Fallback / next step |
|---|---|---|
| `psql` | **absent** | Install PostgreSQL client + server (M2/M3) or use the Docker image |
| `sqlite3` CLI | **absent** | Install before any H-04 profiling; `python3 -c "import sqlite3"` also works on copies |
| Playwright browsers | not installed | `npx playwright install chromium` at M6 (needs the app first) |
| PostgreSQL server | not installed | Docker (`docker run postgres`) or native; record which at M3 |
| Wrangler | not installed locally | Only needed if the audit keeps a Workers target; OLD pins `wrangler ^4.163.0` |

## Agent capability (as configured)

| Capability | Available | Notes |
|---|---|---|
| Web search / fetch | yes | Used for official docs and appendices |
| Sub-agents (reviewer) | yes | Used for fresh-context review of high-risk code (spec 1.5) |
| Cloud browser | yes | For M12/M14 visual QA later |
| MCP servers | **not verified / assumed absent** | Every capability must have a CLI fallback (spec Part 2) |
| Git push to `MBS-done` | **no credential** | See H-01; this blocks spec 0.3 |
| Package installs | yes | Official registries only, pinned, lockfile preserved |

## Reproducing this inventory

```bash
node -v; npm -v; git --version; python3 --version
command -v docker psql sqlite3 gh
uname -srm
```
