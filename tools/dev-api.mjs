#!/usr/bin/env node
/**
 * tools/dev-api.mjs — a disposable API for looking at the portal.
 *
 * Runs the real migrations on an in-memory PGlite database as `app_runtime`, seeds one
 * demo business, and serves `/api/v1` on :4000 with non-Secure cookies so the Vite dev
 * server can proxy to it over plain HTTP.
 *
 * Demo data only. Never point this at a real database and never reuse the password.
 *
 * Usage: npm run dev:api   (then: npm run dev:web)
 */
import { PGlite } from "@electric-sql/pglite";
import { createPgliteDb } from "../packages/data/src/db.ts";
import { applyMigrations } from "../packages/data/src/migrator.ts";
import { hashPassword } from "../packages/domain/src/auth/password.ts";
import { createApiServer } from "../apps/api/src/http.ts";

const PASSWORD = process.env.MBS_DEMO_PASSWORD ?? "mooral demo 12345";
const PORT = Number(process.env.PORT ?? 4000);

const TRADERS = "11111111-1111-4111-8111-111111111111";
const FOODS = "22222222-2222-4222-8222-222222222222";

const db = createPgliteDb(new PGlite());

async function seed() {
  await applyMigrations(db, "db/migrations");
  const passwordHash = await hashPassword(PASSWORD);

  await db.query(
    "insert into platform.tenants (id, slug, name) values ($1, 'mooral-traders', 'Mooral Traders')",
    [TRADERS]
  );
  await db.query(
    "insert into platform.tenants (id, slug, name) values ($1, 'mooral-foods', 'Mooral Foods')",
    [FOODS]
  );

  const users = [
    ["aaaaaaaa-0000-4000-8000-000000000001", "owner@mooral.test"],
    ["aaaaaaaa-0000-4000-8000-000000000002", "manager@mooral.test"],
    ["aaaaaaaa-0000-4000-8000-000000000003", "staff@mooral.test"],
    ["aaaaaaaa-0000-4000-8000-000000000004", "multi@mooral.test"],
  ];
  for (const [id, email] of users) {
    await db.query("insert into platform.users (id, email, password_hash) values ($1, $2, $3)", [
      id,
      email,
      passwordHash,
    ]);
  }

  await db.query(
    `insert into tenant.org_settings (tenant_id, legal_name, bin, address, phone, email)
     values ($1, 'Mooral Traders', '000000000-0101', 'House 12, Road 5, Dhanmondi, Dhaka 1205',
             '+880 1711 000000', 'accounts@mooral.test')`,
    [TRADERS]
  );
  await db.query(
    "insert into tenant.org_settings (tenant_id, legal_name, bin) values ($1, 'Mooral Foods', '000000000-0202')",
    [FOODS]
  );

  const memberships = [
    [TRADERS, users[0][0], "owner"],
    [TRADERS, users[1][0], "manager"],
    [TRADERS, users[2][0], "employee"],
    [TRADERS, users[3][0], "owner"],
    [FOODS, users[3][0], "manager"],
  ];
  for (const [tenantId, userId, role] of memberships) {
    await db.query(
      "insert into tenant.memberships (tenant_id, user_id, role, status) values ($1, $2, $3, 'active')",
      [tenantId, userId, role]
    );
  }
}

await seed();

const server = createApiServer({ db, secureCookies: false });
server.listen(PORT, "0.0.0.0", () => {
  console.log(`mbs demo api on http://127.0.0.1:${PORT}`);
  console.log(`demo sign-in (password: ${PASSWORD}):`);
  console.log("  owner@mooral.test   owner of Mooral Traders");
  console.log("  manager@mooral.test manager of Mooral Traders");
  console.log("  staff@mooral.test   employee, profile is read-only");
  console.log("  multi@mooral.test   two businesses, shows the chooser");
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    server.close(() => process.exit(0));
  });
}
