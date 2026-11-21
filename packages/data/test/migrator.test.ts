import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { createPgliteDb } from "../src/db.ts";
import {
  MigrationError,
  applyMigrations,
  appliedMigrations,
  planMigrations,
  readMigrations,
} from "../src/migrator.ts";

const REPO_MIGRATIONS = "db/migrations";

function tempMigrations(files: Record<string, string>): string {
  const directory = mkdtempSync(join(tmpdir(), "mbs-migrations-"));
  for (const [name, sql] of Object.entries(files)) writeFileSync(join(directory, name), sql);
  return directory;
}

test("applies every migration once and records checksums", async () => {
  const db = createPgliteDb(await new PGlite());
  // Derived from the directory, so adding a milestone's migration does not need this test
  // edited — what is being proved is that every file is applied exactly once, in order.
  const files = readMigrations(REPO_MIGRATIONS);
  const expected = files.map((file) => file.version);
  const first = await applyMigrations(db, REPO_MIGRATIONS);
  assert.deepEqual(
    first.applied.map((file) => file.version),
    expected
  );

  const ledger = await appliedMigrations(db);
  assert.equal(ledger.length, expected.length);
  assert.match(ledger[0]!.checksum, /^[0-9a-f]{64}$/);
  assert.equal(ledger.at(-1)!.filename, files.at(-1)!.filename);

  // Running again is a no-op: no file is ever applied twice.
  const second = await applyMigrations(db, REPO_MIGRATIONS);
  assert.equal(second.applied.length, 0);
  assert.equal(second.skipped, expected.length);
  assert.equal((await appliedMigrations(db)).length, expected.length);
});

test("a file edited after it was applied fails the run", async () => {
  const directory = tempMigrations({
    "0001_first.sql": "create table t_first (id int);",
    "0002_second.sql": "create table t_second (id int);",
  });
  const db = createPgliteDb(await new PGlite());
  await applyMigrations(db, directory);

  writeFileSync(join(directory, "0001_first.sql"), "create table t_first (id int, x int);");
  await assert.rejects(
    () => planMigrations(db, readMigrations(directory)),
    (error: unknown) =>
      error instanceof MigrationError && /changed after it was applied/.test(error.message)
  );
  rmSync(directory, { recursive: true, force: true });
});

test("a failed migration leaves neither schema nor ledger row", async () => {
  const directory = tempMigrations({
    "0001_ok.sql": "create table t_ok (id int);",
    "0002_broken.sql": "create table t_broken (id int); create table t_broken (id int);",
  });
  const db = createPgliteDb(await new PGlite());
  await assert.rejects(() => applyMigrations(db, directory));

  const ledger = await appliedMigrations(db);
  assert.deepEqual(
    ledger.map((row) => row.version),
    ["0001"]
  );
  const tables = await db.query<{ n: number }>(
    "select count(*)::int as n from information_schema.tables where table_name = 't_broken'"
  );
  assert.equal(tables.rows[0]!.n, 0);
  rmSync(directory, { recursive: true, force: true });
});

test("filenames must be numbered, contiguous and lower_snake_case", async () => {
  assert.throws(
    () => readMigrations(tempMigrations({ "001_first.sql": "select 1;" })),
    /bad migration filename/
  );
  assert.throws(
    () => readMigrations(tempMigrations({ "0001_One.sql": "select 1;" })),
    /bad migration filename/
  );
  assert.throws(
    () =>
      readMigrations(
        tempMigrations({ "0001_one.sql": "select 1;", "0003_three.sql": "select 1;" })
      ),
    /contiguous/
  );
});

test("transaction control inside a migration file is rejected", async () => {
  assert.throws(
    () => readMigrations(tempMigrations({ "0001_one.sql": "begin; select 1; commit;" })),
    /transaction control/
  );
});
