/**
 * End-to-end over the real HTTP layer, against a real PostgreSQL engine (PGlite) with the
 * real migrations. Every request below goes through login, the session cookie, the
 * capability policies and RLS as `app_runtime` — nothing is stubbed.
 *
 * What is deliberately checked: the tenant comes from the session, not the request; a token
 * is stored only as a hash; a second business's data is unreachable with a first business's
 * cookie; brute force locks; logout revokes; and the OpenAPI document matches the router.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import { PGlite } from "@electric-sql/pglite";
import { createPgliteDb } from "../../../packages/data/src/db.ts";
import { applyMigrations } from "../../../packages/data/src/migrator.ts";
import { hashPassword } from "../../../packages/domain/src/auth/password.ts";
import { createApiServer, buildHandler } from "../src/http.ts";

const db = createPgliteDb(new PGlite());
const PASSWORD = "correct horse battery staple";

const ALPHA = "11111111-1111-4111-8111-111111111111";
const BETA = "22222222-2222-4222-8222-222222222222";

const USERS = {
  alphaOwner: "aaaaaaaa-0000-4000-8000-000000000001",
  bothOwner: "aaaaaaaa-0000-4000-8000-000000000002",
  alphaEmployee: "aaaaaaaa-0000-4000-8000-000000000003",
  lonely: "aaaaaaaa-0000-4000-8000-000000000004",
  bruteForce: "aaaaaaaa-0000-4000-8000-000000000005",
};

const EMAILS = {
  alphaOwner: "owner@alpha.test",
  bothOwner: "owner@both.test",
  alphaEmployee: "employee@alpha.test",
  lonely: "lonely@nowhere.test",
  bruteForce: "lock@alpha.test",
};

let server: ReturnType<typeof createApiServer>;
let base = "";

async function seed() {
  await applyMigrations(db, "db/migrations");
  const passwordHash = await hashPassword(PASSWORD);

  await db.query("insert into platform.tenants (id, slug, name) values ($1, 'alpha', 'Alpha Traders')", [ALPHA]);
  await db.query("insert into platform.tenants (id, slug, name) values ($1, 'beta', 'Beta Foods')", [BETA]);

  for (const [key, email] of Object.entries(EMAILS)) {
    await db.query("insert into platform.users (id, email, password_hash) values ($1, $2, $3)", [
      USERS[key as keyof typeof USERS],
      email,
      passwordHash,
    ]);
  }

  await db.query("insert into tenant.org_settings (tenant_id, legal_name, bin) values ($1, 'Alpha Traders Ltd', '000000000-0101')", [ALPHA]);
  await db.query("insert into tenant.org_settings (tenant_id, legal_name, bin) values ($1, 'Beta Foods Ltd', '000000000-0202')", [BETA]);

  const memberships: Array<[string, string, string]> = [
    [ALPHA, USERS.alphaOwner, "owner"],
    [ALPHA, USERS.bothOwner, "manager"],
    [BETA, USERS.bothOwner, "owner"],
    [ALPHA, USERS.alphaEmployee, "employee"],
    [ALPHA, USERS.bruteForce, "employee"],
  ];
  for (const [tenantId, userId, role] of memberships) {
    await db.query(
      "insert into tenant.memberships (tenant_id, user_id, role, status) values ($1, $2, $3, 'active')",
      [tenantId, userId, role]
    );
  }
}

before(async () => {
  await seed();
  server = createApiServer({ db, secureCookies: false, lockThreshold: 3, lockSeconds: 60 });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

after(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

interface CallOptions {
  cookie?: string;
  body?: unknown;
  contentType?: string | null;
}

async function call(method: string, path: string, options: CallOptions = {}) {
  const headers: Record<string, string> = {};
  if (options.cookie) headers["cookie"] = options.cookie;
  let body: string | undefined;
  if (options.body !== undefined) {
    body = JSON.stringify(options.body);
    const type = options.contentType === undefined ? "application/json" : options.contentType;
    if (type) headers["content-type"] = type;
  }
  const response = await fetch(`${base}${path}`, { method, headers, body });
  const text = await response.text();
  return {
    status: response.status,
    headers: response.headers,
    json: text ? (JSON.parse(text) as any) : null,
    cookie: (response.headers.getSetCookie?.() ?? [])[0]?.split(";")[0] ?? null,
  };
}

async function login(email: string, extra: Record<string, unknown> = {}) {
  return call("POST", "/api/v1/auth/login", { body: { email, password: PASSWORD, ...extra } });
}

test("health needs no session", async () => {
  const result = await call("GET", "/api/v1/health");
  assert.equal(result.status, 200);
  assert.equal(result.json.status, "ok");
  assert.equal(result.headers.get("cache-control"), "no-store");
  assert.equal(result.headers.get("x-content-type-options"), "nosniff");
  assert.match(result.headers.get("content-security-policy") ?? "", /default-src 'none'/);
  assert.ok(result.headers.get("x-request-id"));
});

test("login rejects a wrong password without leaking the account", async () => {
  const result = await call("POST", "/api/v1/auth/login", {
    body: { email: EMAILS.alphaOwner, password: "wrong but long enough" },
  });
  assert.equal(result.status, 401);
  assert.equal(result.json.error.code, "invalid_credentials");
  assert.equal(result.cookie, null);
  assert.ok(!JSON.stringify(result.json).includes("owner@alpha.test"));
});

test("login is indistinguishable for an unknown email", async () => {
  const result = await call("POST", "/api/v1/auth/login", {
    body: { email: "nobody@alpha.test", password: PASSWORD },
  });
  assert.equal(result.status, 401);
  assert.equal(result.json.error.code, "invalid_credentials");
});

test("repeated failures lock the address, and the lock survives a correct password", async () => {
  const bad = { email: EMAILS.bruteForce, password: "definitely wrong password" };
  const first = await call("POST", "/api/v1/auth/login", { body: bad });
  const second = await call("POST", "/api/v1/auth/login", { body: bad });
  const third = await call("POST", "/api/v1/auth/login", { body: bad });
  assert.deepEqual([first.status, second.status, third.status], [401, 401, 429]);
  assert.equal(third.json.error.code, "too_many_attempts");
  assert.ok(Number(third.headers.get("retry-after")) > 0);

  const correct = await login(EMAILS.bruteForce);
  assert.equal(correct.status, 429);
  assert.equal(correct.cookie, null);
});

test("a successful login issues an HttpOnly cookie and resolves the business from it", async () => {
  const result = await login(EMAILS.alphaOwner);
  assert.equal(result.status, 200);
  assert.equal(result.json.tenant.slug, "alpha");
  assert.equal(result.json.role, "owner");
  assert.ok(result.cookie?.startsWith("mbs_session="));
  const setCookie = result.headers.getSetCookie().join(";");
  assert.match(setCookie, /HttpOnly/);
  assert.match(setCookie, /SameSite=Strict/);
  assert.ok(!JSON.stringify(result.json).includes(PASSWORD));

  const me = await call("GET", "/api/v1/me", { cookie: result.cookie! });
  assert.equal(me.status, 200);
  assert.equal(me.json.user.email, EMAILS.alphaOwner);
  assert.equal(me.json.tenant.name, "Alpha Traders");
  assert.equal(me.json.role, "owner");

  const org = await call("GET", "/api/v1/org", { cookie: result.cookie! });
  assert.equal(org.status, 200);
  assert.equal(org.json.org.legalName, "Alpha Traders Ltd");
  assert.equal(org.json.org.currency, "BDT");
});

test("the session table holds only a sha256 of the token", async () => {
  const result = await login(EMAILS.alphaOwner);
  const token = result.cookie!.split("=")[1]!;
  const stored = await db.query<{ hex: string }>(
    "select encode(token_hash, 'hex') as hex from tenant.sessions where tenant_id = $1",
    [ALPHA]
  );
  assert.ok(stored.rows.length > 0);
  assert.ok(stored.rows.every((row) => row.hex !== token));
  assert.ok(stored.rows.some((row) => /^[0-9a-f]{64}$/.test(row.hex)));
});

test("no cookie, a forged cookie and a malformed cookie are all 401", async () => {
  assert.equal((await call("GET", "/api/v1/me")).status, 401);
  assert.equal((await call("GET", "/api/v1/me", { cookie: "mbs_session=forged" })).status, 401);
  assert.equal((await call("GET", "/api/v1/me", { cookie: "mbs_session=" })).status, 401);
  assert.equal((await call("GET", "/api/v1/org")).status, 401);
});

test("one business's cookie cannot read another business's profile", async () => {
  const alpha = await login(EMAILS.alphaOwner);
  const org = await call("GET", "/api/v1/org", { cookie: alpha.cookie! });
  assert.equal(org.json.org.legalName, "Alpha Traders Ltd");
  assert.ok(!JSON.stringify(org.json).includes("Beta Foods"));

  // The same user's membership in beta does not exist; a slug in the body is not a key.
  const body = await call("PATCH", "/api/v1/org", {
    cookie: alpha.cookie!,
    body: { legalName: "Renamed", tenant_id: BETA },
  });
  assert.equal(body.status, 400);
  assert.equal(body.json.error.code, "invalid_request");
});

test("multi-business login requires a slug, and honours it", async () => {
  const ambiguous = await login(EMAILS.bothOwner);
  assert.equal(ambiguous.status, 409);
  assert.equal(ambiguous.json.error.code, "tenant_required");
  assert.deepEqual(
    ambiguous.json.error.details.tenants.map((tenant: { slug: string }) => tenant.slug).sort(),
    ["alpha", "beta"]
  );
  assert.equal(ambiguous.cookie, null);

  const beta = await login(EMAILS.bothOwner, { tenant_slug: "beta" });
  assert.equal(beta.status, 200);
  assert.equal(beta.json.tenant.slug, "beta");
  assert.equal(beta.json.role, "owner");

  const betaOrg = await call("GET", "/api/v1/org", { cookie: beta.cookie! });
  assert.equal(betaOrg.json.org.legalName, "Beta Foods Ltd");

  const wrong = await login(EMAILS.alphaOwner, { tenant_slug: "beta" });
  assert.equal(wrong.status, 403);
  assert.equal(wrong.json.error.code, "tenant_not_available");
});

test("an account with no active membership cannot sign in", async () => {
  const result = await login(EMAILS.lonely);
  assert.equal(result.status, 403);
  assert.equal(result.json.error.code, "no_business_access");
  assert.equal(result.cookie, null);
});

test("profile updates are role-gated, validated and audited", async () => {
  const employee = await login(EMAILS.alphaEmployee);
  const denied = await call("PATCH", "/api/v1/org", {
    cookie: employee.cookie!,
    body: { legalName: "Should Not Work" },
  });
  assert.equal(denied.status, 403);
  assert.equal(denied.json.error.code, "forbidden");

  const owner = await login(EMAILS.alphaOwner);
  const before = await db.query<{ n: number }>(
    "select count(*)::int as n from tenant.audit_log where action = 'org.update'"
  );

  const invalid = await call("PATCH", "/api/v1/org", {
    cookie: owner.cookie!,
    body: { fiscalYearStartMonth: 13 },
  });
  assert.equal(invalid.status, 400);

  const updated = await call("PATCH", "/api/v1/org", {
    cookie: owner.cookie!,
    body: { legalName: "Alpha Traders Ltd", vatRegistered: true, numberingSystem: "latin" },
  });
  assert.equal(updated.status, 200);
  assert.equal(updated.json.org.vatRegistered, true);
  assert.equal(updated.json.org.numberingSystem, "latin");

  const after = await db.query<{ n: number }>(
    "select count(*)::int as n from tenant.audit_log where action = 'org.update'"
  );
  assert.equal(after.rows[0]!.n, before.rows[0]!.n + 1);

  const audit = await db.query<{ before: unknown; after: unknown }>(
    "select before, after from tenant.audit_log where action = 'org.update' order by id desc limit 1"
  );
  assert.equal((audit.rows[0]!.after as { vatRegistered: boolean }).vatRegistered, true);
});

test("logout revokes the session and the cookie stops working", async () => {
  const result = await login(EMAILS.alphaOwner);
  const out = await call("POST", "/api/v1/auth/logout", { cookie: result.cookie!, body: {} });
  assert.equal(out.status, 204);
  assert.match(out.headers.getSetCookie().join(";"), /Max-Age=0/);

  const me = await call("GET", "/api/v1/me", { cookie: result.cookie! });
  assert.equal(me.status, 401);

  const revoked = await db.query<{ n: number }>(
    "select count(*)::int as n from tenant.sessions where revoked_at is not null"
  );
  assert.ok(revoked.rows[0]!.n >= 1);
});

test("the HTTP layer rejects unknown routes, wrong methods and non-JSON bodies", async () => {
  assert.equal((await call("GET", "/api/v1/nope")).status, 404);

  const wrongMethod = await call("GET", "/api/v1/auth/login");
  assert.equal(wrongMethod.status, 405);
  assert.equal(wrongMethod.headers.get("allow"), "POST");

  const wrongType = await call("POST", "/api/v1/auth/login", {
    body: { email: EMAILS.alphaOwner, password: PASSWORD },
    contentType: "text/plain",
  });
  assert.equal(wrongType.status, 415);

  const badJson = await fetch(`${base}/api/v1/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "{not json",
  });
  assert.equal(badJson.status, 400);
});

test("the OpenAPI document matches the router exactly", async () => {
  const { routes } = buildHandler({ db });
  const document = (await call("GET", "/api/v1/openapi.json")).json;
  assert.equal(document.openapi, "3.1.0");

  const documented = new Set<string>();
  for (const [path, methods] of Object.entries(document.paths as Record<string, object>)) {
    for (const method of Object.keys(methods)) documented.add(`${method.toUpperCase()} ${path}`);
  }
  const routed = new Set(routes.map((route) => `${route.method} ${route.path}`));
  assert.deepEqual([...documented].sort(), [...routed].sort());

  const operationIds = routes.map((route) => route.operationId);
  assert.equal(new Set(operationIds).size, operationIds.length);

  const authed = routes.filter((route) => route.auth);
  for (const route of authed) {
    const operation = document.paths[route.path][route.method.toLowerCase()];
    assert.deepEqual(operation.security, [{ cookieAuth: [] }], route.operationId);
  }
  assert.deepEqual(document.paths["/api/v1/health"].get.security, []);
});
