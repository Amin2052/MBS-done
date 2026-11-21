import { test } from "node:test";
import assert from "node:assert/strict";
import {
  PasswordError,
  PASSWORD_PARAMS,
  assertPasswordAcceptable,
  hashPassword,
  verifyPassword,
} from "../src/auth/password.ts";
import {
  SESSION_COOKIE,
  createSessionToken,
  hashEmail,
  hashSessionToken,
  looksLikeEmail,
  parseCookies,
  serializeSessionCookie,
  tokenCapabilityValue,
  tokensMatch,
} from "../src/auth/session.ts";

test("argon2id hash is PHC-encoded with the ADR parameters", async () => {
  const hash = await hashPassword("correct horse battery staple");
  assert.match(hash, /^\$argon2id\$v=19\$m=19456,t=2,p=1\$[A-Za-z0-9+/=]+\$[A-Za-z0-9+/=]+$/);
  assert.equal(PASSWORD_PARAMS.memorySize, 19456);
  assert.equal(await verifyPassword("correct horse battery staple", hash), true);
  assert.equal(await verifyPassword("correct horse battery stapl", hash), false);
});

test("two hashes of the same password differ (random salt)", async () => {
  const [a, b] = await Promise.all([hashPassword("same-password-twice"), hashPassword("same-password-twice")]);
  assert.notEqual(a, b);
  assert.equal(await verifyPassword("same-password-twice", a), true);
  assert.equal(await verifyPassword("same-password-twice", b), true);
});

test("verification never throws on foreign or malformed hashes", async () => {
  assert.equal(await verifyPassword("x", "not-a-hash"), false);
  assert.equal(await verifyPassword("x", "$2b$10$abcdefghijklmnopqrstuv"), false);
  assert.equal(await verifyPassword("x", ""), false);
});

test("Unicode-equivalent passwords hash to the same value", async () => {
  // Bengali "ক্ষ" written pre-composed and decomposed.
  const composed = "পাসওয়ার্ড\u0995\u09cd\u09b7";
  const decomposed = composed.normalize("NFD");
  const hash = await hashPassword(composed);
  assert.equal(await verifyPassword(decomposed, hash), true);
});

test("short and blank passwords are refused at hash time", async () => {
  await assert.rejects(() => hashPassword("short"), PasswordError);
  await assert.rejects(() => hashPassword("            "), PasswordError);
  assert.throws(() => assertPasswordAcceptable("elevenchars"), PasswordError);
  assert.doesNotThrow(() => assertPasswordAcceptable("twelve chars"));
});

test("session tokens are 256-bit, stored only as sha256, and compared safely", () => {
  const token = createSessionToken();
  assert.match(token, /^[A-Za-z0-9_-]{43}$/);
  assert.notEqual(createSessionToken(), token);

  const hash = hashSessionToken(token);
  assert.match(hash, /^[0-9a-f]{64}$/);
  assert.equal(hash.length, 64);
  assert.equal(tokenCapabilityValue(token), `\\x${hash}`);
  assert.equal(tokensMatch(token, token), true);
  assert.equal(tokensMatch(token, createSessionToken()), false);
});

test("email hashing normalises case and whitespace, and never stores the address", () => {
  const hash = hashEmail("  Owner@Example.COM ");
  assert.match(hash, /^[0-9a-f]{64}$/);
  assert.equal(hash, hashEmail("owner@example.com"));
  assert.notEqual(hash, hashEmail("other@example.com"));
  assert.equal(looksLikeEmail("owner@example.com"), true);
  for (const bad of ["owner", "owner@", "@example.com", "owner@example", "a b@example.com"]) {
    assert.equal(looksLikeEmail(bad), false, bad);
  }
});

test("session cookie is HttpOnly, SameSite=Strict and Secure by default", () => {
  const cookie = serializeSessionCookie("tok", { secure: true });
  assert.match(cookie, new RegExp(`^${SESSION_COOKIE}=tok`));
  assert.match(cookie, /; HttpOnly/);
  assert.match(cookie, /; SameSite=Strict/);
  assert.match(cookie, /; Secure/);
  assert.match(cookie, /; Max-Age=28800/);
  assert.doesNotMatch(serializeSessionCookie("tok", { secure: false }), /Secure/);
});

test("cookie parsing survives extra cookies and encoded values", () => {
  assert.deepEqual(parseCookies("mbs_session=abc; theme=dark"), {
    mbs_session: "abc",
    theme: "dark",
  });
  assert.equal(parseCookies(undefined)["mbs_session"], undefined);
  assert.equal(parseCookies("broken")["broken"], undefined);
});
