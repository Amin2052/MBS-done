# Dependency graph — OLD @ `c2871d2`

Read from `package.json` and `Generator/package.json` without installing anything
(installing from OLD is forbidden, spec 0.1 rule 2).

## Runtime dependencies (root app)

| Package | Declared | Role |
|---|---|---|
| `better-sqlite3` | ^12.11.1 | Local database (native module) |
| `electron` | ^31.7.7 | Desktop runtime (**dev-dependency but shipped**) |
| `react` / `react-dom` | ^18.3.1 | Renderer |
| `react-router-dom` | ^6.28.0 | Hash router |
| `react-is` | ^19.3.1 | Version skew with React 18 — worth checking |
| `recharts` | ^3.9.2 | Dashboard charts |
| `exceljs` | ^4.4.0 | Spreadsheet export/import |
| `qrcode` | ^1.5.4 | Certificates / invoice QR |
| `lucide-react` | ^1.24.0 | Icons |

## Build, test and tooling

`electron-vite` ^2.3.0, `vite` ^5.3.1, `typescript` ^5.5.2, `@swc/core`,
`tailwindcss` ^4.3.2 + `@tailwindcss/postcss`, `electron-builder` ^24.13.3,
`electron-rebuild` ^3.2.9, `@playwright/test` ^1.62.1, `wrangler` ^4.163.0,
`esbuild` ^0.21.5.

## Three dependency trees, one repository

```
package.json  (root: MBS desktop + cloudflare worker tooling)
  ├── better-sqlite3 12 ── native, rebuilt per Electron ABI (postinstall electron-rebuild)
  ├── electron 31 ── EOL risk (see below)
  └── wrangler 4 ── used only by cloudflare/* scripts

Generator/package.json  (activation-key generator)
  └── own package-lock.json (248 KB) — separate patching and audit surface

mbs-user/  (employee app)
  └── no own package.json: reuses the root dependency tree and lockfile
```

## Internal dependency shape

```
routes.tsx ──► pages/* ──► components/* ──► hooks/* (use-auth, use-license, use-theme…)
                                 │
                                 └──► services/* (auth, company-settings, report,
                                      messaging, realtime, owner-control, online-shared)
                                            │
src/pages ──► IPC bridge (window.mbs.*) ──► electron/main/main.ts
                                            (145 ipcMain.handle registrations)
                                                 │
                                                 ├──► repositories/* (25 files, 13,013 lines)
                                                 │        └──► src/database/database.ts (SQLite)
                                                 └──► cloud-sync-manager ──► Cloudflare Worker ──► D1
```

Key properties:
- The renderer **never** touches SQLite directly; everything crosses IPC.
- `electron/main/main.ts` is a **110 KB, 145-handler** module — the single largest
  coupling point in the product. NEW must not reproduce this shape (use one router per
  domain in `apps/api`).
- `Generator` shares no code with the app apart from types under `shared/`.

## Risks

| # | Risk | Detail |
|---|---|---|
| D1 | **Electron 31 is far behind current** | Spec 14.3 requires a current Electron with fuses; plan the upgrade in NEW, never patch OLD |
| D2 | Two lockfiles | `package-lock.json` (415 KB) + `Generator/package-lock.json` (249 KB) |
| D3 | `react-is` 19 against React 18 | Possible duplicate-render bugs |
| D4 | Vulnerability scan not run | `npm audit` requires installing dependencies from OLD, which is forbidden; run it on a `git archive` copy under `_work/old-copy/` at M2 instead |
| D5 | `wrangler` present as a dev dependency | Confirms a Cloudflare Workers target exists; see the hosting decision (M2) |

## Verification method

```bash
git -C old-src show HEAD:package.json
git -C old-src show HEAD:Generator/package.json
```

No install was performed; versions above are the declared ranges, not resolved ones.
