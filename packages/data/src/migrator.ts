/**
 * The migration runner (M4). Every migration is applied in one transaction together with
 * its ledger row, and its sha256 is recorded, so an edited file is detected instead of
 * silently producing a database nobody else has.
 *
 * Rules enforced here rather than in prose:
 *   - filenames are `NNNN_name.sql` and versions are contiguous from 0001;
 *   - a file is never edited after it was applied (checksum drift fails the run);
 *   - a migration file contains no transaction control — the runner owns the transaction;
 *   - each file is applied exactly once, recorded in `mbs_meta.schema_migrations`.
 */
import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { Db } from "./db.ts";

export interface MigrationFile {
  version: string;
  filename: string;
  checksum: string;
  sql: string;
}

export interface AppliedMigration {
  version: string;
  filename: string;
  checksum: string;
  applied_at: string | Date;
  execution_ms: number;
}

export interface MigrationPlan {
  pending: MigrationFile[];
  applied: AppliedMigration[];
  unchanged: number;
}

export class MigrationError extends Error {}

const FILE_PATTERN = /^(\d{4})_([a-z0-9]+(?:_[a-z0-9]+)*)\.sql$/;
const TRANSACTION_CONTROL = /^\s*(begin|commit|rollback|start\s+transaction)\s*;/gim;

export function readMigrations(directory: string): MigrationFile[] {
  const names = readdirSync(directory)
    .filter((name) => name.endsWith(".sql"))
    .sort();

  if (names.length === 0) throw new MigrationError(`no .sql files in ${directory}`);

  const migrations: MigrationFile[] = [];
  for (const [index, filename] of names.entries()) {
    const match = FILE_PATTERN.exec(filename);
    if (!match) {
      throw new MigrationError(
        `bad migration filename ${filename} — expected NNNN_lower_snake_name.sql`
      );
    }
    const expected = String(index + 1).padStart(4, "0");
    if (match[1] !== expected) {
      throw new MigrationError(
        `migration ${filename} should be version ${expected} — versions must be contiguous from 0001`
      );
    }
    const sql = readFileSync(join(directory, filename), "utf8");
    if (TRANSACTION_CONTROL.test(sql)) {
      throw new MigrationError(
        `${filename} contains transaction control; the runner wraps each file in one transaction`
      );
    }
    if (sql.trim().length === 0) throw new MigrationError(`${filename} is empty`);
    migrations.push({
      version: match[1],
      filename,
      checksum: createHash("sha256").update(sql).digest("hex"),
      sql,
    });
  }
  return migrations;
}

export async function ensureLedger(db: Db): Promise<void> {
  await db.exec("create schema if not exists mbs_meta");
  await db.exec(`
    create table if not exists mbs_meta.schema_migrations (
      version      text primary key check (version ~ '^[0-9]{4}$'),
      filename     text not null,
      checksum     text not null check (checksum ~ '^[0-9a-f]{64}$'),
      applied_at   timestamptz not null default now(),
      execution_ms integer not null check (execution_ms >= 0),
      applied_by   text not null default current_user
    )
  `);
}

export async function appliedMigrations(db: Db): Promise<AppliedMigration[]> {
  const result = await db.query<AppliedMigration>(
    "select version, filename, checksum, applied_at, execution_ms from mbs_meta.schema_migrations order by version"
  );
  return result.rows;
}

/** Compare what is on disk with what was applied. Drift is an error, not a warning. */
export function assertNoDrift(migrations: MigrationFile[], applied: AppliedMigration[]): void {
  const byVersion = new Map(applied.map((row) => [row.version, row]));
  for (const file of migrations) {
    const row = byVersion.get(file.version);
    if (!row) continue;
    if (row.checksum !== file.checksum) {
      throw new MigrationError(
        `${file.filename} was changed after it was applied (checksum ${row.checksum.slice(0, 12)}… -> ` +
          `${file.checksum.slice(0, 12)}…). Never edit an applied migration; add a new one.`
      );
    }
    if (row.filename !== file.filename) {
      throw new MigrationError(
        `version ${file.version} was applied as ${row.filename} but is now ${file.filename}`
      );
    }
  }
  const known = new Set(migrations.map((file) => file.version));
  for (const row of applied) {
    if (!known.has(row.version)) {
      throw new MigrationError(
        `migration ${row.filename} is recorded as applied but the file is missing`
      );
    }
  }
}

export async function planMigrations(
  db: Db,
  migrations: MigrationFile[]
): Promise<MigrationPlan> {
  await ensureLedger(db);
  const applied = await appliedMigrations(db);
  assertNoDrift(migrations, applied);
  const done = new Set(applied.map((row) => row.version));
  const pending = migrations.filter((file) => !done.has(file.version));
  return { pending, applied, unchanged: applied.length };
}

export interface ApplyOptions {
  /** Take a transaction-scoped advisory lock so two runners cannot interleave. */
  lock?: boolean;
  onApply?: (file: MigrationFile, index: number, total: number) => void;
}

export async function applyMigrations(
  db: Db,
  directory: string,
  options: ApplyOptions = {}
): Promise<{ applied: MigrationFile[]; skipped: number }> {
  const migrations = readMigrations(directory);
  const plan = await planMigrations(db, migrations);
  if (plan.pending.length === 0) return { applied: [], skipped: plan.unchanged };

  const applied: MigrationFile[] = [];
  for (const [index, file] of plan.pending.entries()) {
    options.onApply?.(file, index + 1, plan.pending.length);
    const startedAt = Date.now();
    const executionMs = () => Date.now() - startedAt;
    await db.transaction(async (tx) => {
      if (options.lock) {
        await tx.query("select pg_advisory_xact_lock(hashtext('mbs.schema_migrations'))");
      }
      await tx.exec(file.sql);
      await tx.query(
        "insert into mbs_meta.schema_migrations (version, filename, checksum, execution_ms) values ($1, $2, $3, $4)",
        [file.version, file.filename, file.checksum, executionMs()]
      );
    });
    applied.push(file);
  }
  return { applied, skipped: plan.unchanged };
}
