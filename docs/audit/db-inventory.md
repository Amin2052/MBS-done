# Database and SQLite inventory — OLD @ `c2871d2`

## Files

| Store | Location | Schema source |
|---|---|---|
| Local | `app.getPath("userData")/mooral.db` (`src/database/database.ts:5`) | `src/database/database.ts` (2,851 lines) |
| Cloud | Cloudflare D1 `mooral-db`, id `92581899-43b1-4073-9622-5fed9e93b0c8` | `cloudflare/migrations/0001..0006` |
| Dead | `cloud_records` table + `cloudflare/worker/schema.sql` | unreferenced by `worker/index.js` |

**No database file is tracked in git.** Real `mooral.db` files live on customer
machines only — H-04 must supply anonymised copies. Until then the ETL uses synthetic
fixtures derived from these schemas.

## D1 migrations

| File | Lines | Nature |
|---|---|---|
| `0001_mbs_core_schema.sql` | 564 | Full initial schema |
| `0002_workspace_isolation.sql` | 228 | Additive: `workspace_id` on 20 tables, `workspaces` table, indexes |
| `0003_workspace_unique_constraints.sql` | 437 | Recreates tables to scope UNIQUE per workspace — **DO NOT APPLY BLIND** |
| `0004_sync_cursor_columns.sql` | 102 | Sync cursors |
| `0005_sync_tombstones.sql` | 28 | Deletes as tombstones |
| `0006_workspace_reset_epoch.sql` | 38 | Workspace reset epoch |

## Money as REAL — the headline defect

`0001_mbs_core_schema.sql` stores money and rates as floating point:

| Line | Column | Table context |
|---|---|---|
| 146 | `salary REAL DEFAULT 0` | employee contracts |
| 192, 219 | `price REAL DEFAULT 0` | products / line items |
| 220, 321–326 | `total, subtotal, discount, tax, paid, due REAL DEFAULT 0` | orders / invoices |
| 246, 275 | `amount REAL DEFAULT 0 / NOT NULL` | transactions / payments |
| 291–293 | `debit, credit, running_balance REAL DEFAULT 0` | ledger entries |
| 449, 481 | `tax_rate, accounting_default_tax_rate REAL DEFAULT 0` | settings |
| 487 | `payroll_overtime_rate REAL DEFAULT 1.5` | settings |

`0003` repeats the same `REAL` columns when it recreates tables (`salary REAL`,
`price REAL`, …), so the defect survives the isolation work.

**NEW rule:** `NUMERIC(19,4)`, decimal strings over the wire, decimal library in code,
server-computed totals (spec 11.2). Migration must record the exact legacy value and the
new value for every money column, then classify each ≥ ৳0.01 difference as
`legacy-bug`, `intended-change` or `regression`.

## Numbering

`src/database/database.ts` exposes `getNextSequenceValue(dbHandle, counterKey, seedNextValue)`
which reads and increments `id_counters` **inside the caller's transaction**
(`order-repository.ts`, `invoice-repository.ts`). This is the legacy gapless-numbering
mechanism.

**NEW rule (spec 11.3):** keep gapless per business *and* series using a locked counter
row (`SELECT … FOR UPDATE`) inside the issuing transaction — not a PostgreSQL sequence,
not an advisory lock (unsupported behind transaction-mode pooling).

## Tenant columns as found

`0002` adds `workspace_id TEXT NOT NULL DEFAULT 'mooral-main'` to 20 tables:
users, employees, employee_contracts, products, customers, orders,
inventory_transactions, transactions, accounts, journal_entries, ledger_entries,
invoices, certificates, notifications, permission_profiles, user_permissions,
profile_permissions, audit_log, company_settings, mbs_messages.

Deliberately excluded (with reasons in the file): `permissions` (shared catalogue),
`sessions` (derived via JOIN), `cloud_records` (dead).

**Not yet done, blocking a second tenant:** `company_settings` singleton CHECK, global
UNIQUE on business keys, and owner-uniqueness index scoping (all in `0003`).

## SQLite-specific notes

- `better-sqlite3` is synchronous; transactions are explicit
  (`db.transaction(...)`), which is why counter reads are safe today.
- WAL mode usage was not confirmed from a live file (no database is tracked). When H-04
  copies arrive: copy `mooral.db` **with** `-wal`/`-shm`, run `PRAGMA integrity_check`,
  open only with `file:…?mode=ro` or `immutable=1`.
- Backup/restore exists in-product (`electron/main/backup-service.ts`,
  `tests/main/entry-backup-restore.ts`) — legacy backups must not be mixed into the
  PostgreSQL cutover without verifying which format they are.
