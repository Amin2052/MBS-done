#!/usr/bin/env node
/**
 * tools/verify-schema.mjs — apply every migration to a fresh PostgreSQL engine (PGlite)
 * and verify the multi-tenancy guarantees from the catalogue and from behaviour.
 *
 * Run:  node tools/verify-schema.mjs
 * Exit: 0 all checks pass, 1 otherwise.
 *
 * This is the dynamic counterpart to tools/check-rls.mjs: the static checker reads the
 * SQL, this one asks the database what it actually built.
 *
 * Not covered (needs a real server): concurrent transactions through a connection pool.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";

const MIGRATIONS = "db/migrations";
const results = [];
let failed = 0;

function check(name, ok, detail) {
  if (!ok) failed += 1;
  results.push(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
}

const db = await new PGlite();

for (const file of readdirSync(MIGRATIONS).filter((f) => f.endsWith(".sql")).sort()) {
  const sql = readFileSync(join(MIGRATIONS, file), "utf8");
  try {
    await db.exec(sql);
  } catch (error) {
    console.error(`FAIL  migration ${file} did not apply: ${error.message}`);
    process.exit(1);
  }
}
console.log(`applied ${readdirSync(MIGRATIONS).filter((f) => f.endsWith(".sql")).length} migration file(s)`);

// --- catalogue: RLS on every tenant table -------------------------------------
const tables = await db.query(`
  select c.relname,
         c.relrowsecurity      as rls,
         c.relforcerowsecurity as forced,
         (select count(*) from pg_policy p where p.polrelid = c.oid) as policies
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'tenant' and c.relkind = 'r'
  order by c.relname
`);

check("tenant schema has tables", tables.rows.length > 0, `${tables.rows.length} tables`);

const APPEND_ONLY = new Set(["audit_log"]);
for (const row of tables.rows) {
  const expected = APPEND_ONLY.has(row.relname) ? 2 : 4;
  check(`tenant.${row.relname} has RLS enabled`, row.rls === true);
  check(`tenant.${row.relname} has FORCE RLS`, row.forced === true);
  check(
    `tenant.${row.relname} has ${expected} policies`,
    Number(row.policies) === expected,
    `${row.policies} policies`
  );
}

// --- append-only: audit log cannot be rewritten --------------------------------
const auditPolicies = await db.query(`
  select p.polcmd, p.polname
  from pg_policy p
  join pg_class c on c.oid = p.polrelid
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'tenant' and c.relname = 'audit_log'
`);
const cmds = auditPolicies.rows.map((r) => r.polcmd);
check("audit_log has no UPDATE policy", !cmds.includes("w"), cmds.join(","));
check("audit_log has no DELETE policy", !cmds.includes("d"), cmds.join(","));
check("audit_log has an INSERT policy", cmds.includes("a"), cmds.join(","));

// --- privileges: the runtime role cannot touch identity tables -----------------
const grants = await db.query(`
  select table_schema, table_name, privilege_type
  from information_schema.role_table_grants
  where grantee = 'app_runtime'
`);
const platformGrants = grants.rows.filter((r) => r.table_schema === "platform");
check(
  "app_runtime has no direct privileges on platform.*",
  platformGrants.length === 0,
  platformGrants.map((r) => `${r.table_name}/${r.privilege_type}`).join(",") || "none"
);

const auditGrants = grants.rows
  .filter((r) => r.table_name === "audit_log")
  .map((r) => r.privilege_type)
  .sort();
check(
  "app_runtime can only SELECT and INSERT on audit_log",
  auditGrants.join(",") === "INSERT,SELECT",
  auditGrants.join(",")
);

// --- app_runtime is not a superuser and does not own tables --------------------
const role = await db.query(
  "select rolsuper, rolbypassrls from pg_roles where rolname = 'app_runtime'"
);
check("app_runtime is not a superuser", role.rows[0].rolsuper === false);
check("app_runtime has no BYPASSRLS", role.rows[0].rolbypassrls === false);

// --- functional isolation ------------------------------------------------------
async function asTenant(tenantId, fn) {
  return db.transaction(async (tx) => {
    await tx.query("SET LOCAL ROLE app_runtime");
    await tx.query("SELECT set_config('app.tenant_id', $1, true)", [tenantId]);
    return fn(tx);
  });
}

const tenantA = "11111111-1111-4111-8111-111111111111";
const tenantB = "22222222-2222-4222-8222-222222222222";

// Tenants are platform data; seeding them is a migration/ops action, so do it as owner.
await db.query("insert into platform.tenants (id, slug, name) values ($1,'alpha','Alpha Ltd')", [tenantA]);
await db.query("insert into platform.tenants (id, slug, name) values ($1,'beta','Beta Ltd')", [tenantB]);

await asTenant(tenantA, (tx) =>
  tx.query("insert into tenant.org_settings (tenant_id, legal_name) values ($1,'Alpha Legal')", [tenantA])
);

const seenByB = await asTenant(tenantB, (tx) =>
  tx.query("select count(*)::int as n from tenant.org_settings")
);
check("tenant B cannot see tenant A's settings", seenByB.rows[0].n === 0, `n=${seenByB.rows[0].n}`);

let crossedInsert = false;
try {
  await asTenant(tenantB, (tx) =>
    tx.query("insert into tenant.org_settings (tenant_id, legal_name) values ($1,'Sneaky')", [tenantA])
  );
} catch (error) {
  crossedInsert = /row-level security|violates|duplicate/i.test(String(error.message));
}
check("tenant B cannot insert a row for tenant A", crossedInsert);

const crossUpdate = await asTenant(tenantB, (tx) =>
  tx.query("update tenant.org_settings set legal_name = 'hacked' where tenant_id = $1 returning tenant_id", [tenantA])
);
check("tenant B cannot update tenant A's settings", crossUpdate.rows.length === 0);

const noContext = await db.transaction(async (tx) => {
  await tx.query("SET LOCAL ROLE app_runtime");
  return tx.query("select count(*)::int as n from tenant.org_settings");
});
check("no tenant context returns zero rows", noContext.rows[0].n === 0, `n=${noContext.rows[0].n}`);

// --- audit log is append-only in practice --------------------------------------
await asTenant(tenantA, (tx) =>
  tx.query(
    "insert into tenant.audit_log (tenant_id, action, entity) values ($1,'settings.update','org_settings')",
    [tenantA]
  )
);

// Two layers protect the audit log: no UPDATE policy, and no UPDATE privilege. A hard
// permission denial is the stronger result; zero affected rows is also acceptable.
let rewrote = 0;
let denied = false;
try {
  const rewrite = await asTenant(tenantA, (tx) =>
    tx.query("update tenant.audit_log set action = 'tampered' where tenant_id = $1 returning id", [tenantA])
  );
  rewrote = rewrite.rows.length;
} catch (error) {
  denied = /permission denied|row-level security/i.test(String(error.message));
}
check("audit_log rows cannot be updated", denied || rewrote === 0, denied ? "denied by privilege" : `rows=${rewrote}`);

let deleteDenied = false;
try {
  await asTenant(tenantA, (tx) =>
    tx.query("delete from tenant.audit_log where tenant_id = $1", [tenantA])
  );
} catch (error) {
  deleteDenied = /permission denied|row-level security/i.test(String(error.message));
}
check("audit_log rows cannot be deleted", deleteDenied, deleteDenied ? "denied by privilege" : "delete succeeded — regression");

// --- money is exact ------------------------------------------------------------
const money = await db.query(
  "select (1234567890123.4567::numeric(19,4))::text as t, pg_typeof(1234567890123.4567::numeric(19,4))::text as ty"
);
check("numeric(19,4) holds 13 integer digits exactly", money.rows[0].t === "1234567890123.4567", money.rows[0].t);

// --- identity is reachable only through the definer function -------------------
let blocked = false;
try {
  await db.transaction(async (tx) => {
    await tx.query("SET LOCAL ROLE app_runtime");
    await tx.query("select * from platform.users limit 1");
  });
} catch (error) {
  blocked = /permission denied/i.test(String(error.message));
}
check("app_runtime cannot read platform.users directly", blocked);

const lookupGrant = await db.query(
  "select has_function_privilege('app_runtime','platform.user_by_email(text)','execute') as ok"
);
check("app_runtime may call platform.user_by_email", lookupGrant.rows[0].ok === true);

console.log(results.join("\n"));
console.log(`\n${results.length - failed}/${results.length} checks passed`);
await db.close();
process.exit(failed === 0 ? 0 : 1);
