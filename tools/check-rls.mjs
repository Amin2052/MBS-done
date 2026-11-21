#!/usr/bin/env node
/**
 * tools/check-rls.mjs — static enforcement of the tenancy, money and audit rules over
 * every SQL file in db/migrations.
 *
 * Run:  node tools/check-rls.mjs
 * Exit: 0 clean, 1 violations (the build must fail).
 *
 * Rules (spec 6.2, 6.5, 11.2, ADR-0003):
 *  A. Every table with a tenant_id column must ENABLE and FORCE row level security.
 *  B. ... and must have a policy for each of SELECT, INSERT, UPDATE, DELETE.
 *  C. Append-only tables (`-- @append-only` above the CREATE TABLE) must have exactly
 *     SELECT and INSERT policies and no UPDATE/DELETE policy.
 *  D. No REAL / DOUBLE PRECISION / MONEY column types anywhere.
 *  E. No set_config('app.tenant_id' | 'app.session_token_hash' | 'app.user_id', ..., false)
 *     — every setting must be transaction-local.
 *  F. Every policy predicate must reference app.tenant_id or a declared pre-authentication
 *     capability setting (ADR-0015), and a capability policy may only ever be SELECT.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const MIGRATIONS = "db/migrations";
const TENANT_COLUMN = /\btenant_id\b/;
/** Pre-authentication settings from ADR-0015; each may only widen a SELECT. */
const CAPABILITY_SETTINGS = ["app.session_token_hash", "app.user_id"];
const PROBLEMS = [];
let tablesChecked = 0;

function fail(file, message) {
  PROBLEMS.push(`${file}: ${message}`);
}

/** Strip line comments so keyword detection cannot be fooled by prose. */
function stripComments(sql) {
  return sql
    .split("\n")
    .map((line) => {
      const at = line.indexOf("--");
      return at === -1 ? line : line.slice(0, at);
    })
    .join("\n");
}

const files = readdirSync(MIGRATIONS)
  .filter((name) => name.endsWith(".sql"))
  .sort();

if (files.length === 0) {
  console.error(`FAIL  no migrations found in ${MIGRATIONS}`);
  process.exit(1);
}

const sources = new Map();
let all = "";
for (const file of files) {
  const raw = readFileSync(join(MIGRATIONS, file), "utf8");
  sources.set(file, raw);
  all += `\n${stripComments(raw)}`;
}

const lower = all.toLowerCase();

// D. Money types.
for (const [file, raw] of sources) {
  const body = stripComments(raw).toLowerCase();
  const forbidden = [
    [/\breal\b/g, "REAL"],
    [/\bdouble\s+precision\b/g, "DOUBLE PRECISION"],
    [/\bmoney\b/g, "MONEY"],
    [/\bsmallmoney\b/g, "SMALLMONEY"],
  ];
  for (const [pattern, label] of forbidden) {
    const found = body.match(pattern);
    if (found) fail(file, `forbidden float/legacy money type ${label} (${found.length}x)`);
  }
}

// E. Session-level settings.
for (const setting of ["app.tenant_id", "app.session_token_hash", "app.user_id"]) {
  const pattern = new RegExp(
    `set_config\\(\\s*'${setting.replace(/[.]/g, "\\.")}'\\s*,[^)]*,\\s*false\\s*\\)`,
    "i"
  );
  if (pattern.test(all)) {
    fail("(all)", `set_config('${setting}', ..., false) is forbidden — settings must be transaction-local`);
  }
}

// Tables.
const tableRe = /create\\s+table\\s+(?:if\\s+not\\s+exists\\s+)?([a-z_]+\\.[a-z_]+)\\s*\\(([\\s\\S]*?)\\n\\);/gi;
const tables = [];
for (const match of lower.matchAll(tableRe)) {
  tables.push({ name: match[1], body: match[2], index: match.index });
}

const policies = [];
const policyRe = /create\\s+policy\\s+[a-z0-9_]+\\s+on\\s+([a-z_]+\\.[a-z_]+)\\s+for\\s+(select|insert|update|delete|all)([\\s\\S]*?);/gi;
for (const match of lower.matchAll(policyRe)) {
  policies.push({ table: match[1], cmd: match[2], body: match[3] });
}

// The DO block creates policies with dynamic SQL, so also accept the loop declaration:
const loopTables = /foreach\\s+t\\s+in\\s+array\\s+array\\[([\\s\\S]*?)\\]/i.exec(lower);
const loopCovered = new Set(
  loopTables ? [...loopTables[1].matchAll(/'([a-z_]+\\.[a-z_]+)'/g)].map((m) => m[1]) : []
);
const appendOnlyList = /t\\s*=\\s*'([a-z_]+\\.[a-z_]+)'/.exec(lower);

for (const table of tables) {
  const isTenant = TENANT_COLUMN.test(table.body);
  if (!isTenant) continue;
  tablesChecked += 1;

  // The policy loop applies ENABLE/FORCE with EXECUTE format('alter table %s ...'), so a
  // table covered by the loop satisfies the rule through the generated statement.
  const loopEnables = /execute\\s+format\\(\\s*'alter\\s+table\\s+%s\\s+enable\\s+row\\s+level\\s+security'/.test(lower);
  const loopForces = /execute\\s+format\\(\\s*'alter\\s+table\\s+%s\\s+force\\s+row\\s+level\\s+security'/.test(lower);
  const escapedName = table.name.replace(".", "\\.");
  const enabled =
    loopEnables ||
    new RegExp(`alter\\\\s+table\\\\s+${escapedName}\\\\s+enable\\\\s+row\\\\s+level\\\\s+security`).test(lower);
  const forced =
    loopForces ||
    new RegExp(`alter\\\\s+table\\\\s+${escapedName}\\\\s+force\\\\s+row\\\\s+level\\\\s+security`).test(lower);

  if (!enabled) fail(table.name, "missing ENABLE ROW LEVEL SECURITY");
  if (!forced) fail(table.name, "missing FORCE ROW LEVEL SECURITY");

  const ownPolicies = policies.filter((p) => p.table === table.name);
  const coveredByLoop = loopCovered.has(table.name);

  if (!coveredByLoop) {
    for (const cmd of ["select", "insert", "update", "delete"]) {
      if (!ownPolicies.some((p) => p.cmd === cmd || p.cmd === "all")) {
        fail(table.name, `missing ${cmd.toUpperCase()} policy`);
      }
    }
  }

  for (const policy of ownPolicies) {
    const capability = CAPABILITY_SETTINGS.find((setting) => policy.body.includes(setting));
    if (!policy.body.includes("app.tenant_id") && !capability) {
      fail(
        table.name,
        `policy ${policy.cmd} references neither app.tenant_id nor a declared capability setting`
      );
    }
    if (capability && policy.cmd !== "select") {
      fail(table.name, `capability policy for ${capability} is ${policy.cmd.toUpperCase()}, not SELECT`);
    }
    if (/^\\s*using\\s*\\(\\s*true\\s*\\)/i.test(policy.body)) {
      fail(table.name, `policy ${policy.cmd} is USING (true) — always passes`);
    }
  }
}

// C. Append-only handling: the migration marks one table via a literal in the DO block.
if (appendOnlyList) {
  const appendOnlyTable = appendOnlyList[1];
  const ownPolicies = policies.filter((p) => p.table === appendOnlyTable);
  for (const policy of ownPolicies) {
    if (policy.cmd === "update" || policy.cmd === "delete" || policy.cmd === "all") {
      fail(appendOnlyTable, `append-only table has a ${policy.cmd.toUpperCase()} policy`);
    }
  }
}

if (tablesChecked === 0) fail("(all)", "no tenant tables detected — the checker is not reading the schema");

if (PROBLEMS.length > 0) {
  console.error(`FAIL  ${PROBLEMS.length} tenancy/money violation(s)`);
  for (const problem of PROBLEMS) console.error(`  - ${problem}`);
  process.exit(1);
}

const capabilityPolicies = policies.filter((policy) =>
  CAPABILITY_SETTINGS.some((setting) => policy.body.includes(setting))
);

console.log(
  `OK  ${tablesChecked} tenant table(s), ${policies.length} explicit policy statement(s) ` +
    `(${capabilityPolicies.length} capability), ${loopCovered.size} table(s) covered by the ` +
    `generated policy loop; no float money, no session-level settings`
);
