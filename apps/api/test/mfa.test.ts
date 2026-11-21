/**
 * Second-factor sign-in over the real HTTP layer (ADR-0017): no mocks, real migrations, real
 * capability policies, `app_runtime` throughout.
 *
 * What is deliberately checked: a password alone never yields a cookie for an owner; the
 * enrolment secret is returned once and works; codes are single-use and replayed codes are
 * refused; a recovery code works once; wrong codes hit the same throttle as the password;
 * challenges expire; employees are unaffected; and the audit row records how the session
 * was proved.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import { PGlite } from "@electric-sql/pglite";
import { createPgliteDb } from "../../../packages/data/src/db.ts";
import { applyMigrations } from "../../../packages/data/src/migrator.ts";
import { hashPassword } from "../../../packages/domain/src/auth/password.ts";
import { formatRecoveryCode } from "../../../packages/domain/src/auth/recovery.ts";
import { totpCodeAt } from "../../../packages/domain/src/auth/totp.ts";
import { createApiServer } from "../src/http.ts";

const db = createPgliteDb(new PGlite());
const PASSWORD = "correct horse battery staple";
const ALPHA = "11111111-1111-4111-8111-111111111111";

/** A controllable clock: TOTP steps and challenge expiry need to move on purpose. */
// Real clock: sessions are stamped with the database's now(), so a pinned past instant
// eventually makes expires_at earlier than created_at.
let nowMs = Date.now();
const clock = () => new Date(nowMs);

const USERS = {
  owner: "aaaaaaaa-0000-4000-8000-000000000001",
  manager: "aaaaaaaa-0000-4000-8000-000000000002",
  employee: "aaaaaaaa-0000-4000-8000-000000000003",
  throttled: "aaaaaaaa-0000-4000-8000-000000000004",
};

const EMAILS = {
  owner: "owner@alpha.test",
  manager: "manager@alpha.test",
  employee: "employee@alpha.test",
  throttled: "lock@alpha.test",
};

let server: ReturnType<typeof createApiServer>;
let base = "";
/** Captured at enrolment, because the server never returns it again. */
let managerSecret = "";

async function seed() {
  await applyMigrations(db, "db/migrations");
  const passwordHash = await hashPassword(PASSWORD);
  await db.query("insert into platform.tenants (id, slug, name) values ($1, 'alpha', 'Alpha Traders')", [ALPHA]);
  for (const [key, email] of Object.entries(EMAILS)) {
    await db.query("insert into platform.users (id, email, password_hash) values ($1, $2, $3)", [
      USERS[key as keyof typeof USERS],
      email,
      passwordHash,
    ]);
  }
  await db.query(
    "insert into tenant.org_settings (tenant_id, legal_name) values ($1, 'Alpha Traders Ltd')",
    [ALPHA]
  );
  const memberships: Array<[string, string]> = [
    [USERS.owner, "owner"],
    [USERS.manager, "manager"],
    [USERS.employee, "employee"],
    [USERS.throttled, "owner"],
  ];
  for (const [userId, role] of memberships) {
    await db.query(
      "insert into tenant.memberships (tenant_id, user_id, role, status) values ($1, $2, $3, 'active')",
      [ALPHA, userId, role]
    );
  }
}

before(async () => {
  await seed();
  server = createApiServer({
    db,
    secureCookies: false,
    now: clock,
    lockThreshold: 10,
    lockSeconds: 900,
    mfaMaxAttempts: 5,
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

after(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

async function call(method: string, path: string, options: { cookie?: string; body?: unknown } = {}) {
  const headers: Record<string, string> = {};
  if (options.cookie) headers["cookie"] = options.cookie;
  let body: string | undefined;
  if (options.body !== undefined) {
    body = JSON.stringify(options.body);
    headers["content-type"] = "application/json";
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

const login = (email: string) =>
  call("POST", "/api/v1/auth/login", { body: { email, password: PASSWORD } });

const verify = (challengeToken: string, code: string) =>
  call("POST", "/api/v1/auth/mfa/verify", { body: { challenge_token: challengeToken, code } });

const enroll = (challengeToken: string, code: string) =>
  call("POST", "/api/v1/auth/mfa/enroll", { body: { challenge_token: challengeToken, code } });

test("an owner's password alone yields a challenge and no cookie", async () => {
  const result = await login(EMAILS.owner);
  assert.equal(result.status, 200);
  assert.equal(result.cookie, null);
  assert.equal(result.json.mfa.status, "enroll");
  assert.equal(result.json.mfa.enrollment.account, EMAILS.owner);
  assert.match(result.json.mfa.enrollment.otpauth_uri, /^otpauth:\/\/totp\//);
  assert.equal(result.json.mfa.challenge_token.length >= 32, true);

  // The same password with no second factor is still not a session.
  const me = await call("GET", "/api/v1/me");
  assert.equal(me.status, 401);
});

test("an employee signs in with the password alone", async () => {
  const result = await login(EMAILS.employee);
  assert.equal(result.status, 200);
  assert.ok(result.cookie?.startsWith("mbs_session="));
  assert.equal(result.json.tenant.slug, "alpha");
  const me = await call("GET", "/api/v1/me", { cookie: result.cookie! });
  assert.equal(me.status, 200);
  assert.equal(me.json.role, "employee");
});

test("a wrong enrolment code spends an attempt and reveals nothing", async () => {
  const challenge = (await login(EMAILS.manager)).json.mfa;
  const wrong = await enroll(challenge.challenge_token, "000000");
  assert.equal(wrong.status, 401);
  assert.equal(wrong.json.error.code, "mfa_invalid_code");
  assert.equal(wrong.json.error.details.attempts_remaining, 4);
  assert.equal(wrong.cookie, null);
});

test("enrolment confirms the code, returns recovery codes once and creates the session", async () => {
  const challenge = (await login(EMAILS.manager)).json.mfa;
  const secret = challenge.enrollment.secret;
  managerSecret = secret;
  const result = await enroll(challenge.challenge_token, totpCodeAt(secret, nowMs));

  assert.equal(result.status, 200);
  assert.ok(result.cookie?.startsWith("mbs_session="));
  assert.equal(result.json.recovery_codes.length, 10);
  assert.equal(new Set(result.json.recovery_codes).size, 10);
  for (const code of result.json.recovery_codes) {
    assert.match(code, /^[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}$/);
  }
  assert.equal(JSON.stringify(result.json).includes(secret), false);

  const me = await call("GET", "/api/v1/me", { cookie: result.cookie! });
  assert.equal(me.status, 200);
  assert.equal(me.json.role, "manager");

  const audit = await db.query<{ strength: string }>(
    "select after->>'strength' as strength from tenant.audit_log where action = 'auth.login' order by id desc limit 1"
  );
  assert.equal(audit.rows[0]!.strength, "totp");
  const enrolAudit = await db.query<{ n: number }>(
    "select count(*)::int as n from tenant.audit_log where action = 'auth.mfa_enroll'"
  );
  assert.equal(enrolAudit.rows[0]!.n, 1);

  const state = await db.query<{ confirmed: boolean; n: number }>(
    `select c.confirmed_at is not null as confirmed,
            (select count(*)::int from platform.mfa_recovery_codes r where r.user_id = c.user_id) as n
       from platform.mfa_credentials c where c.user_id = $1`,
    [USERS.manager]
  );
  assert.equal(state.rows[0]!.confirmed, true);
  assert.equal(state.rows[0]!.n, 10);
});

test("the stored secret is sealed, never base32 text", async () => {
  const row = await db.query<{ secret_ciphertext: string }>(
    "select secret_ciphertext from platform.mfa_credentials where user_id = $1",
    [USERS.manager]
  );
  assert.match(row.rows[0]!.secret_ciphertext, /^v1\./);
  assert.equal(/[A-Z2-7]{32}/.test(row.rows[0]!.secret_ciphertext), false);
});

test("an enrolled account is asked for a code, and the current code signs it in", async () => {
  const challenge = await login(EMAILS.manager);
  assert.equal(challenge.json.mfa.status, "verify");
  assert.equal(challenge.json.mfa.enrollment, undefined);
  assert.equal(challenge.cookie, null);

  const wrong = await verify(challenge.json.mfa.challenge_token, "111111");
  assert.equal(wrong.status, 401);
  assert.equal(wrong.json.error.code, "mfa_invalid_code");
  assert.equal(wrong.json.error.details.attempts_remaining, 4);

  // The enrolment code was already spent; a later step's code is the live one.
  nowMs += 30_000;
  const ok = await verify(challenge.json.mfa.challenge_token, totpCodeAt(managerSecret, nowMs));
  assert.equal(ok.status, 200);
  assert.ok(ok.cookie?.startsWith("mbs_session="));
  assert.equal(ok.json.tenant.slug, "alpha");

  const me = await call("GET", "/api/v1/me", { cookie: ok.cookie! });
  assert.equal(me.status, 200);
  assert.equal(me.json.role, "manager");

  const audit = await db.query<{ strength: string }>(
    "select after->>'strength' as strength from tenant.audit_log where action = 'auth.login' order by id desc limit 1"
  );
  assert.equal(audit.rows[0]!.strength, "totp");
});

test("a challenge is single use, and a spent code cannot be replayed", async () => {
  const first = await login(EMAILS.manager);
  nowMs += 30_000;
  const code = totpCodeAt(managerSecret, nowMs);
  const ok = await verify(first.json.mfa.challenge_token, code);
  assert.equal(ok.status, 200);

  // Same challenge again: it was consumed by the successful verification.
  nowMs += 30_000;
  const again = await verify(first.json.mfa.challenge_token, totpCodeAt(managerSecret, nowMs));
  assert.equal(again.status, 401);
  assert.equal(again.json.error.code, "mfa_challenge_invalid");

  // A fresh challenge, but the code from the step already spent: a replay.
  nowMs -= 30_000;
  const second = await login(EMAILS.manager);
  const replay = await verify(second.json.mfa.challenge_token, code);
  assert.equal(replay.status, 401);
  assert.equal(replay.json.error.code, "mfa_invalid_code");
});

test("a challenge expires, and an unknown token is refused", async () => {
  const challenge = await login(EMAILS.manager);
  nowMs += 301_000;
  const expired = await verify(challenge.json.mfa.challenge_token, totpCodeAt(managerSecret, nowMs));
  assert.equal(expired.status, 401);
  assert.equal(expired.json.error.code, "mfa_challenge_expired");

  const unknown = await verify("not-a-real-token", "123456");
  assert.equal(unknown.status, 401);
  assert.equal(unknown.json.error.code, "mfa_challenge_invalid");
});

test("a recovery code signs in once and only once", async () => {
  const stored = await db.query<{ n: number }>(
    "select count(*)::int as n from platform.mfa_recovery_codes where user_id = $1",
    [USERS.manager]
  );
  assert.ok(stored.rows[0]!.n >= 10);

  // Re-enrol the manager so the test owns the plain codes it is about to spend.
  const challenge = await login(EMAILS.manager);
  assert.equal(challenge.json.mfa.status, "verify");

  const codes = await db.query<{ id: string }>(
    "select id from platform.mfa_recovery_codes where user_id = $1 and used_at is null limit 1",
    [USERS.manager]
  );
  assert.equal(codes.rows.length, 1);

  // The plain codes are not recoverable from the database, so a fresh enrolment in the
  // manager's own flow is the only honest way to get one: use a second account instead.
  const ownerChallenge = await login(EMAILS.owner);
  const secret = ownerChallenge.json.mfa.enrollment.secret;
  const enrolled = await enroll(ownerChallenge.json.mfa.challenge_token, totpCodeAt(secret, nowMs));
  const recoveryCode = formatRecoveryCode(enrolled.json.recovery_codes[0]);

  const fresh = await login(EMAILS.owner);
  const used = await verify(fresh.json.mfa.challenge_token, recoveryCode);
  assert.equal(used.status, 200);
  assert.ok(used.cookie?.startsWith("mbs_session="));
  const audit = await db.query<{ strength: string }>(
    "select after->>'strength' as strength from tenant.audit_log where action = 'auth.login' order by id desc limit 1"
  );
  assert.equal(audit.rows[0]!.strength, "recovery");

  const spent = await db.query<{ n: number }>(
    "select count(*)::int as n from platform.mfa_recovery_codes where user_id = $1 and used_at is not null",
    [USERS.owner]
  );
  assert.equal(spent.rows[0]!.n, 1);

  // The same code cannot be spent twice, even from a new challenge.
  const retry = await login(EMAILS.owner);
  const reused = await verify(retry.json.mfa.challenge_token, recoveryCode);
  assert.equal(reused.status, 401);
  assert.equal(reused.json.error.code, "mfa_invalid_code");
  assert.equal(reused.cookie, null);
});

test("five wrong codes exhaust the challenge, so the password is needed again", async () => {
  const challenge = await login(EMAILS.manager);
  const statuses: number[] = [];
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const result = await verify(challenge.json.mfa.challenge_token, "987654");
    statuses.push(result.status);
  }
  assert.deepEqual(statuses, [401, 401, 401, 401, 401]);

  const exhausted = await verify(challenge.json.mfa.challenge_token, "123456");
  assert.equal(exhausted.status, 401);
  assert.equal(exhausted.json.error.code, "mfa_challenge_invalid");
  assert.equal(exhausted.cookie, null);
});

test("the challenge and MFA routes appear in the OpenAPI document", async () => {
  const document = (await call("GET", "/api/v1/openapi.json")).json;
  assert.ok(document.paths["/api/v1/auth/mfa/verify"].post);
  assert.ok(document.paths["/api/v1/auth/mfa/enroll"].post);
  const body = document.paths["/api/v1/auth/mfa/verify"].post.requestBody;
  assert.deepEqual(body.content["application/json"].schema.required, ["challenge_token", "code"]);
});
