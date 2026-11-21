# ADR-0002 — Data access layer

**Status:** Accepted · **Date:** 2026-11-21 · **Class:** D1 · **Reversibility:** medium
(queries are isolated in repository modules; the driver sits behind them)

## Context

Spec 5.5 requires the data layer to pass tests for: interactive transactions, nested
writes, raw SQL, batches, tenant isolation, background jobs and transaction pooling. The
hard constraint from spec 6.2 is that **every** transaction begins with

```sql
SELECT set_config('app.tenant_id', $1, true);
```

and that RLS is enforced by the database, not by the ORM.

## Options considered

| Option | Assessment |
|---|---|
| Prisma | Good DX, but tenant context must be injected via a client extension and raw transactions; the generated client hides the `BEGIN` boundary that RLS correctness depends on. Bypass paths (`$queryRawUnsafe`, nested writes in separate transactions) make isolation harder to prove. |
| Drizzle | Typed and close to SQL; workable, but schema definitions duplicate what the SQL migrations already must express, and its transaction API still needs a manual `set_config` first statement. |
| **Kysely + `pg`** | Typed query builder over SQL you fully control; `db.transaction()` exposes the real connection so the first statement can be `set_config(..., true)`; raw SQL is first-class; no hidden second connection. |
| Plain `pg` | Same guarantees, less type safety; more boilerplate per query. |

## Decision

**Kysely** over **`pg`** (`node-postgres`), with one explicit helper:

```ts
// packages/domain/src/db/withTenant.ts
export function withTenant(tenantId: string, fn: (trx: Kysely<DB>) => Promise<T>) {
  return db.transaction().execute(async (trx) => {
    await sql`select set_config('app.tenant_id', ${tenantId}, true)`.execute(trx);
    return fn(trx);
  });
}
```

Rules:
- Every repository function takes a transaction handle, never the pool.
- No repository may call `db` (the pool) directly for tenant data.
- Migrations run as the migration role; the application runs as `app_runtime`
  (no `BYPASSRLS`, does not own tables).
- `search_path` is pinned for the runtime role.

## Consequences

- Tenant isolation is provable at the SQL level and testable by connecting as
  `app_runtime` with no tenant context: every query must return zero rows.
- Type safety is generated from the schema (`kysely-codegen`) rather than hand-written.
- Interactive transactions are available for money-moving operations (invoice numbering),
  which the audit's `id_counters` pattern requires.
- Slightly more boilerplate than Prisma; accepted in exchange for provable isolation.

## Verification (M3)

1. `set_config` is the first statement in every transaction — asserted by a query log in
   tests.
2. Two tenants, one connection pool of size 1, interleaved transactions: no leakage.
3. A query without tenant context returns zero rows, not an error.

## Sources

- https://kysely.dev/docs/recipes/transactions (checked 2026-11-21)
- https://www.postgresql.org/docs/18/ddl-rowsecurity.html (checked 2026-11-21)
