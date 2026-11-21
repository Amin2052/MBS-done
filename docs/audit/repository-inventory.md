# Repository inventory — OLD @ `c2871d2`

Read-only audit (spec Part 4). Everything below is measured from the pinned commit, not
inferred from file names. Regenerate the underlying data with
`node tools/manifest.mjs --repo ../old-src --ref HEAD --out docs/audit/old-manifest-before.csv`.

## Scale

| Metric | Value |
|---|---|
| Tracked files | 338 |
| Total bytes | 8,968,812 (≈ 8.6 MiB) |
| Manifest SHA-256 | `63827bba84f8d322527f592e9e5f61484150627366b106931b2f5944ff5dd6ec` |
| Largest file | `src/assets/license-background.png` — 1,641,225 bytes (identical blob also at `public/` and `Generator/src/assets/`) |
| Largest source file | `electron/main/main.ts` — 110,854 bytes |
| Largest data file | `package-lock.json` — 415,188 bytes |

## Language mix (by extension)

| Extension | Files |
|---|---|
| `.ts` | 167 |
| `.tsx` | 75 |
| `.css` | 35 |
| `.mjs` | 19 |
| `.json` | 12 |
| `.sql` | 7 |
| `.png` | 4 |
| `.html` | 4 |
| `.js` | 3 |

No binary office documents. **No SQLite database file is tracked** (checked
`*.sqlite*`, `*.db`, `*.db3`, `*.mdb`, `*.accdb`, `*.xlsx`, `*.docx`, `*.pdf` — zero
matches), so no database copy is needed from git; real `mooral.db` files exist only on
customers' machines (H-04).

## Top-level layout

| Path | Role |
|---|---|
| `electron/` | Electron main + preload (`main.ts` 110 KB, auth/security, backup, cloud sync) |
| `src/` | React renderer: pages, components, repositories, services, i18n, pdf, router |
| `mbs-user/` | Second Electron app for employees (own preload/main/renderer/shared, own build config) |
| `Generator/` | Third app (`Generator/electron`, `Generator/src`) with **its own `package.json` and lockfile** (248 KB) — an activation/key generator by the look of the naming |
| `cloudflare/` | Worker (`worker/index.js`, 1,087 lines), `wrangler.toml`, `portal/` assets, 6 D1 migrations |
| `shared/` | Shared types |
| `scripts/` | QA and release verification scripts (`verify-online-architecture`, `verify-release`, `owner-pc-d1-migrate`) |
| `tests/main/` | Node entry-point tests (backup/restore, bidirectional sync, cloud multi-user, cloud reset, FK integrity, IPC security, licence mode switch, messaging authorisation) |
| `public/`, `index.html` | Renderer shell |
| `.husky/`, `commitlint.config.cjs` | Commit conventions |
| `playwright.config.ts` | E2E configuration |

## Three applications in one repository

1. **MBS desktop** (root `package.json`): Electron 31 + better-sqlite3 12 + React 18.
2. **MBS-user** (`mbs-user/`): employee-facing Electron app, built by
   `electron-vite build --config mbs-user/electron.vite.config.ts` and packaged with
   `electron-builder --projectDir mbs-user`.
3. **Generator** (`Generator/`): separate dependency tree and lockfile — parallel
   dependency risk (two `package-lock.json` files to keep patched).

## Dead or misleading paths found

- `cloudflare/worker/schema.sql` and the `cloud_records` table are referenced by the
  migration comments as **dead code** ("unreferenced anywhere in `index.js`").
- `cloudflare/wrangler.toml` references `.claude/multi-company-sync-checkpoint.md`,
  which is **not tracked** in the repository — the audit trail it points to is missing.
- The wrangler config says `MBS_WORKSPACE_ID` was removed because it pinned the whole
  deployment to one tenant. That comment is the primary evidence that shared
  multi-tenancy was never completed, rather than regressed.

## What this means for NEW

The SaaS is not a greenfield rewrite: `src/repositories/*` (13,013 lines across 25 files)
is the business-logic corpus to port, and `electron/main` already contains auth,
backup/restore, IPC security and cloud-sync behaviour with tests. Copy, adapt, record in
`docs/ORIGINS.md`.
