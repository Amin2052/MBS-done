#!/usr/bin/env node
/**
 * tools/migrate.mjs — CLI for the migration runner.
 *
 *   node tools/migrate.mjs            apply every pending migration
 *   node tools/migrate.mjs --status   show the ledger next to the files on disk
 *   node tools/migrate.mjs --check    verify checksums and pending files, change nothing
 *   node tools/migrate.mjs --dry-run  list what would be applied
 *
 * Reads DATABASE_URL (never printed). The connection must be allowed to create schemas —
 * production runs this as `mbs_migrator`; the API itself connects as `app_runtime`.
 */
import { readdirSync } from "node:fs";
import { Pool } from "pg";
import { createPgDb } from "../packages/data/src/db.ts";
import {
  MigrationError,
  appliedMigrations,
  applyMigrations,
  ensureLedger,
  planMigrations,
  readMigrations,
} from "../packages/data/src/migrator.ts";

const MIGRATIONS = "db/migrations";
const flags = new Set(process.argv.slice(2));
const known = new Set(["--status", "--check", "--dry-run", "--help"]);
for (const flag of flags) {
  if (!known.has(flag)) {
    console.error(`unknown option ${flag}\n`);
    flags.add("--help");
  }
}

if (flags.has("--help")) {
  console.log(
    "usage: node tools/migrate.mjs [--status|--check|--dry-run]\n" +
      "  DATABASE_URL must point at the migrator connection (not app_runtime)."
  );
  process.exit(flags.has("--help") && !flags.has("--status") ? 1 : 0);
}

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set — refusing to guess a database");
  process.exit(1);
}

const migrations = readMigrations(MIGRATIONS);

if (flags.has("--check") || flags.has("--dry-run")) {
  // No server needed for the file-level half of the check.
  console.log(`${migrations.length} migration file(s) on disk, versions contiguous`);
  if (flags.has("--dry-run") && !url) process.exit(0);
}

const pool = new Pool({ connectionString: url, max: 1 });
const db = createPgDb(pool);

function describeTarget(value) {
  try {
    const parsed = new URL(value);
    return `${parsed.hostname}:${parsed.port || "5432"}${parsed.pathname}`;
  } catch {
    return "(unparseable connection string)";
  }
}

let exitCode = 0;
try {
  await ensureLedger(db);
  const plan = await planMigrations(db, migrations);

  if (flags.has("--status")) {
    console.log(`target ${describeTarget(url)}`);
    console.log(`applied ${plan.applied.length}, pending ${plan.pending.length}`);
    for (const row of plan.applied) {
      console.log(`  ${row.version}  ${row.filename}  ${row.checksum.slice(0, 12)}…  ${row.applied_at}`);
    }
    for (const file of plan.pending) console.log(`  ${file.version}  ${file.filename}  (pending)`);
  } else if (flags.has("--check") || flags.has("--dry-run")) {
    console.log(
      plan.pending.length === 0
        ? "OK  every file is applied and every checksum matches"
        : `${plan.pending.length} pending: ${plan.pending.map((f) => f.filename).join(", ")}`
    );
    if (flags.has("--check") && plan.pending.length > 0) exitCode = 1;
  } else {
    const result = await applyMigrations(db, MIGRATIONS, {
      lock: true,
      onApply: (file, index, total) => console.log(`applying ${index}/${total} ${file.filename}`),
    });
    console.log(
      result.applied.length === 0
        ? `OK  nothing to apply (${result.skipped} already applied)`
        : `OK  applied ${result.applied.length} migration(s); ${result.skipped} were already applied`
    );
  }
} catch (error) {
  exitCode = 1;
  if (error instanceof MigrationError) console.error(`FAIL ${error.message}`);
  else console.error(`FAIL ${error.message}`);
} finally {
  await pool.end();
}

process.exit(exitCode);
