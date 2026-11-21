#!/usr/bin/env node
/**
 * tools/spikes/rls-pglite.mjs — M2 spike: forced RLS + transaction-local tenant
 * context, exercised as a NON-superuser runtime role against a real PostgreSQL
 * engine (PGlite = PostgreSQL compiled to WASM).
 *
 * Run:  node tools/spikes/rls-pglite.mjs
 *
 * Why a separate role: a superuser bypasses row-level security even when the
 * table has FORCE ROW LEVEL SECURITY. The first version of this spike ran as
 * PGlite's built-in superuser and every policy was silently ignored — the exact
 * footgun the master prompt warns about. The application must therefore never
 * connect as an owner/superuser, and the CI check that greps migrations is not
 * enough on its own: the role matters too.
 *
 * What it proves
 *  1. With no tenant context, the runtime role sees zero rows (fail-closed).
 *  2. With context set transaction-locally, only that tenant's rows are visible.
 *  3. An INSERT carrying another tenant's id is rejected by WITH CHECK.
 *  4. An UPDATE across tenants affects zero rows.
 *  5. Context does not survive COMMIT onto the next transaction.
 *  6. A superuser (or any BYPASSRLS role) sees everything — documented as the
 *     reason the runtime role must never be privileged.
 *  7. NUMERIC(19,4) round-trips exactly.
 *
 * Not proven here: interleaved concurrency through a real connection pool.
 * PGlite is a single connection, so that test needs a real server (open item in
 * docs/milestones/M02.md).
 */
import { PGlite } from "@electric-sql/pglite";

const results = [];
let failed = 0;

function check(name, condition, detail) {
  const ok = Boolean(condition);
  if (!ok) failed += 1;
  results.push(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
}

const db = await new PGlite();

await db.exec(`
  CREATE TABLE invoices (
    id        bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    tenant_id text NOT NULL,
    number    text NOT NULL,
    total     numeric(19,4) NOT NULL
  );

  ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
  ALTER TABLE invoices FORCE ROW LEVEL SECURITY;

  CREATE POLICY invoices_select ON invoices
    FOR SELECT USING (tenant_id = current_setting('app.tenant_id', true));
  CREATE POLICY invoices_insert ON invoices
    FOR INSERT WITH CHECK (tenant_id = current_setting('app.tenant_id', true));
  CREATE POLICY invoices_update ON invoices
    FOR UPDATE USING (tenant_id = current_setting('app.tenant_id', true))
    WITH CHECK (tenant_id = current_setting('app.tenant_id', true));
  CREATE POLICY invoices_delete ON invoices
    FOR DELETE USING (tenant_id = current_setting('app.tenant_id', true));

  -- The role the application will actually use: not a superuser, no BYPASSRLS,
  -- does not own the table.
  CREATE ROLE app_runtime NOLOGIN NOINHERIT;
  GRANT USAGE ON SCHEMA public TO app_runtime;
  GRANT SELECT, INSERT, UPDATE, DELETE ON invoices TO app_runtime;
  GRANT USAGE, SELECT ON SEQUENCE invoices_id_seq TO app_runtime;
`);

/** Run `fn` as the unprivileged runtime role, with no tenant context. */
async function asRuntime(fn) {
  return db.transaction(async (tx) => {
    await tx.query("SET LOCAL ROLE app_runtime");
    return fn(tx);
  });
}

/** Run `fn` as the runtime role with a transaction-local tenant context. */
async function asTenant(tenantId, fn) {
  return db.transaction(async (tx) => {
    await tx.query("SET LOCAL ROLE app_runtime");
    await tx.query("SELECT set_config('app.tenant_id', $1, true)", [tenantId]);
    return fn(tx);
  });
}

// Seed through the same role + policy path the application will use.
await asTenant("tenant-a", (tx) =>
  tx.query("INSERT INTO invoices (tenant_id, number, total) VALUES ('tenant-a','INV-A-1','1250.5000')")
);
await asTenant("tenant-a", (tx) =>
  tx.query("INSERT INTO invoices (tenant_id, number, total) VALUES ('tenant-a','INV-A-2','99.9900')")
);
await asTenant("tenant-b", (tx) =>
  tx.query("INSERT INTO invoices (tenant_id, number, total) VALUES ('tenant-b','INV-B-1','7777.0000')")
);

// 1. Runtime role, no context -> zero rows.
const noCtx = await asRuntime((tx) => tx.query("SELECT count(*)::int AS n FROM invoices"));
check("no tenant context returns zero rows", noCtx.rows[0].n === 0, `n=${noCtx.rows[0].n}`);

// 2. Tenant A sees only its own two rows.
const aRows = await asTenant("tenant-a", (tx) =>
  tx.query("SELECT tenant_id, number FROM invoices ORDER BY number")
);
check(
  "tenant A sees only its own rows",
  aRows.rows.length === 2 && aRows.rows.every((r) => r.tenant_id === "tenant-a"),
  aRows.rows.map((r) => `${r.tenant_id}/${r.number}`).join(",")
);

// 3. Tenant A cannot insert a row owned by tenant B.
let rejected = false;
try {
  await asTenant("tenant-a", (tx) =>
    tx.query("INSERT INTO invoices (tenant_id, number, total) VALUES ('tenant-b','INV-X','1.0000')")
  );
} catch (error) {
  rejected = /row-level security|violates/i.test(String(error.message));
}
check("insert with another tenant's id is rejected", rejected);

// 4. Tenant A cannot update tenant B's row; zero rows are affected.
const crossUpdate = await asTenant("tenant-a", (tx) =>
  tx.query("UPDATE invoices SET total = '0.0000' WHERE number = 'INV-B-1' RETURNING id")
);
check("cross-tenant update affects zero rows", crossUpdate.rows.length === 0, `rows=${crossUpdate.rows.length}`);

// 5. Context does not leak past COMMIT on the same connection.
await asTenant("tenant-a", (tx) => tx.query("SELECT count(*) FROM invoices"));
const afterCommit = await asRuntime((tx) => tx.query("SELECT count(*)::int AS n FROM invoices"));
check("context does not leak into the next transaction", afterCommit.rows[0].n === 0, `n=${afterCommit.rows[0].n}`);

// 6. Role separation matters: superuser bypasses RLS despite FORCE.
const superuserView = await db.query("SELECT count(*)::int AS n FROM invoices");
check(
  "superuser bypasses RLS despite FORCE (documents why the runtime role must be unprivileged)",
  superuserView.rows[0].n === 3,
  `n=${superuserView.rows[0].n}`
);

// 7. Numeric money round-trips exactly.
const money = await asTenant("tenant-a", (tx) =>
  tx.query("SELECT total::text AS t FROM invoices WHERE number = 'INV-A-1'")
);
check("NUMERIC(19,4) preserves 1250.5000 exactly", money.rows[0].t === "1250.5000", money.rows[0].t);

console.log(results.join("\n"));
console.log(`\n${results.length - failed}/${results.length} checks passed`);
await db.close();
process.exit(failed === 0 ? 0 : 1);
