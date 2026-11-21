# Architecture report — OLD @ `c2871d2`

## Shape

```
Electron desktop (MBS)                  Cloudflare Worker + D1
┌─────────────────────────┐            ┌──────────────────────────┐
│ React 18 renderer       │  HTTPS     │ worker/index.js (1,087 L)│
│  └ repositories (25)    │ ─────────► │  /v1/* REST + /health    │
│  └ services, pdf, i18n  │  sync      │  D1: mooral-db           │
│ Electron main           │            │  migrations 0001–0006    │
│  └ auth/security        │            │  portal/ static assets   │
│  └ better-sqlite3       │            └──────────────────────────┘
│     mooral.db (local)   │
└─────────────────────────┘
        ▲
        │ separate Electron app
┌───────┴─────────────────┐        ┌──────────────────────────┐
│ mbs-user (employee)     │        │ Generator (activation)   │
│ own main/preload/       │        │ own package.json+lock    │
│ renderer, own builder   │        │                          │
└─────────────────────────┘        └──────────────────────────┘
```

## Two data stores, one logical schema

- **Local:** `better-sqlite3` file at `app.getPath("userData")/mooral.db`
  (`src/database/database.ts:5`), opened synchronously, 2,851 lines of schema,
  migrations and helpers.
- **Cloud:** Cloudflare D1 database `mooral-db`
  (`database_id 92581899-43b1-4073-9622-5fed9e93b0c8`), schema created by
  `0001_mbs_core_schema.sql` (564 lines) and patched by 0002–0006.
- Sync is a custom cursor/tombstone design added by
  `0004_sync_cursor_columns.sql`, `0005_sync_tombstones.sql` and
  `0006_workspace_reset_epoch.sql`, driven from
  `electron/main/cloud/cloud-sync-manager.ts` and `src/repositories/cloud-sync-repository.ts`.

**Consequence for NEW:** the PostgreSQL target needs the *logical* schema, not either
physical one. Schema divergence between `0001` and `src/database/database.ts` is a
migration risk to quantify in M1's DB relationship diagram.

## Tenant model as found

| Fact | Evidence |
|---|---|
| Isolation was **not** implemented originally | `0002` header: "0001 shipped with NO workspace_id column on ANY table … never filters a single query by workspace" |
| Phase 1 isolation added `workspace_id` to 20 tables, additive only | `0002_workspace_isolation.sql` |
| `company_settings` still physically single-row (`CHECK (id = 1)`) until 0003 | `0002`, comment block |
| Global UNIQUE columns remain global until 0003 | `0002` header; `0003_workspace_unique_constraints.sql` (437 lines, **DO NOT APPLY BLIND**) |
| One legacy bridge secret accepted for one workspace only | `wrangler.toml`, `MBS_API_KEY` |
| Workspace creation endpoint gated by `MBS_ADMIN_KEY` (secret) | `wrangler.toml` comment |

**Consequence for NEW:** the spec's model — global user identity + membership per
business + forced RLS — is a genuine redesign, not a rename of `workspace_id`. No
`memberships` table exists in OLD; `users` carries `workspace_id` directly.

## Authentication and authorisation as found

- `electron/main/auth/security/password.ts` — password hashing exists (format
  `scrypt$N$r$p$saltHex$hashHex` per the `workspaces` comment).
- `src/repositories/session-repository.ts`, `password-reset-repository.ts`,
  `user-repository.ts` (669 lines), `permission-profile-repository.ts`,
  `audit-log-repository.ts` (160 lines).
- Permission catalogs exist as data (`permissions` table, described in `0002` as static
  shared reference data, not tenant data).
- Tests exist for IPC security and messaging authorisation (`tests/main/entry-ipc-security.ts`,
  `entry-messaging-authorization.ts`).

**Consequence for NEW:** reuse the permission *catalogue* and audit-log shape; replace
scrypt with Argon2id, add MFA/passkeys/session revocation per spec 6.6.

## Renderer modules observed

30 entries under `src/pages` including `accounting/`, `settings/`, plus
`dashboard`, `customers`, `products`, `inventory`, `orders`, `invoices`, `employees`,
`reports`, `certificates`, `profile`, `change-password`. `src/i18n` ships **three**
locales — `bn` (120 KB), `ar` (86 KB), `en` (63 KB). Arabic was not mentioned in the
spec and needs an owner decision: keep, drop, or keep for layout testing.

## Risks identified in this pass

| # | Risk | Impact |
|---|---|---|
| A1 | Money is `REAL` in D1 (`0001`: price, total, amount, debit, credit, running_balance, subtotal, discount, tax, paid, due, salary, tax_rate) | Rounding drift on migration; spec 11.2 requires classifying every ≥ ৳0.01 difference |
| A2 | Schema exists twice (local TS schema vs D1 SQL) and may already disagree | ETL source of truth is ambiguous |
| A3 | `0003` requires table recreation (DO NOT APPLY BLIND) | Any live tenant migration needs a rehearsed backup/restore |
| A4 | Three apps, two lockfiles, one shared dependency graph | Patching and build blast radius |
| A5 | Offline-first desktop behaviour vs online-only v1 | Cutover risk per business (see offline report) |
| A6 | `.claude` audit checkpoint referenced but absent | Lost architectural rationale |
| A7 | `Generator` writes/validates activation keys — licence material | Must never ship inside the tenant SaaS |
