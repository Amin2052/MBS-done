/**
 * TOTP/HOTP against the published test vectors (RFC 6238 appendix B, RFC 4226 appendix D)
 * plus the properties the sign-in flow depends on: a narrow clock window, refusal of a
 * replayed step, and recovery codes that survive formatting.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  base32Decode,
  base32Encode,
  checkTotpCode,
  currentStep,
  formatSecretForDisplay,
  generateTotpSecret,
  hotp,
  normaliseTotpCode,
  otpauthUri,
  totpCodeAt,
} from "../src/auth/totp.ts";
import {
  RECOVERY_CODE_COUNT,
  formatRecoveryCode,
  generateRecoveryCodes,
  hashRecoveryCode,
  looksLikeRecoveryCode,
  normaliseRecoveryCode,
} from "../src/auth/recovery.ts";
import { developmentSecretsKey, openSecret, parseSecretsKey, sealSecret } from "../src/auth/secret-box.ts";

/** RFC 6238's seed: the ASCII string "12345678901234567890". */
const RFC_SECRET = base32Encode(Buffer.from("12345678901234567890", "utf8"));

test("base32 round-trips and rejects foreign characters", () => {
  const bytes = Uint8Array.from([0xde, 0xad, 0xbe, 0xef, 0x00, 0x01]);
  assert.deepEqual([...base32Decode(base32Encode(bytes))], [...bytes]);
  assert.throws(() => base32Decode("not*base32"), /not base32/);
  assert.throws(() => base32Decode(""), /empty/);
  assert.equal(RFC_SECRET, "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ");
});

test("HOTP matches RFC 4226 appendix D", () => {
  const secret = Buffer.from("12345678901234567890", "utf8");
  const expected = ["755224", "287082", "359152", "969429", "338314", "254676", "287922", "162583", "399871", "520489"];
  expected.forEach((code, counter) => assert.equal(hotp(secret, counter, 6), code));
});

test("TOTP matches RFC 6238 appendix B at 8 digits", () => {
  const vectors: Array<[number, string]> = [
    [59, "94287082"],
    [1111111109, "07081804"],
    [1111111111, "14050471"],
    [1234567890, "89005924"],
    [2000000000, "69279037"],
    [20000000000, "65353130"],
  ];
  for (const [seconds, expected] of vectors) {
    assert.equal(
      totpCodeAt(RFC_SECRET, seconds * 1000, { digits: 8, periodSeconds: 30 }),
      expected,
      `t=${seconds}`
    );
  }
});

test("the default configuration is 6 digits over 30 seconds", () => {
  assert.equal(currentStep(59_000), 1);
  assert.equal(totpCodeAt(RFC_SECRET, 59_000), "287082");
  assert.equal(normaliseTotpCode(" 287 082 "), "287082");
  assert.equal(normaliseTotpCode("2870821"), null);
  assert.equal(normaliseTotpCode("28708a"), null);
});

test("a one-step clock window is accepted and a wider skew is not", () => {
  const at = 1_700_000_000_000;
  const previous = totpCodeAt(RFC_SECRET, at - 30_000);
  const twoStepsBack = totpCodeAt(RFC_SECRET, at - 60_000);
  const current = totpCodeAt(RFC_SECRET, at);

  assert.equal(checkTotpCode({ secret: RFC_SECRET, code: current, atMs: at }).ok, true);
  assert.equal(checkTotpCode({ secret: RFC_SECRET, code: previous, atMs: at }).ok, true);
  assert.equal(checkTotpCode({ secret: RFC_SECRET, code: twoStepsBack, atMs: at }).ok, false);
});

test("a code from a step already spent is a replay", () => {
  const at = 1_700_000_000_000;
  const step = currentStep(at);
  const code = totpCodeAt(RFC_SECRET, at);

  assert.deepEqual(checkTotpCode({ secret: RFC_SECRET, code, atMs: at, lastUsedStep: step - 1 }), {
    ok: true,
    step,
  });
  const replay = checkTotpCode({ secret: RFC_SECRET, code, atMs: at, lastUsedStep: step });
  assert.equal(replay.ok, false);
  assert.equal(replay.reason, "replay");
});

test("a malformed code is refused before any HMAC work", () => {
  assert.equal(checkTotpCode({ secret: RFC_SECRET, code: "12345", atMs: 0 }).reason, "format");
  assert.equal(checkTotpCode({ secret: "!!!!", code: "123456", atMs: 0 }).reason, "bad_secret");
});

test("secrets are 160 bits, readable in groups, and usable in an otpauth URI", () => {
  const secret = generateTotpSecret();
  assert.equal(secret.length, 32);
  assert.match(formatSecretForDisplay(secret), /^[A-Z2-7]{4}( [A-Z2-7]{4}){7}$/);

  const uri = otpauthUri({ secret, account: "owner+books@mooral.test" });
  assert.match(uri, /^otpauth:\/\/totp\/Mooral:owner%2Bbooks%40mooral\.test\?/);
  const query = new URL(uri.replace("otpauth://", "https://"));
  assert.equal(query.searchParams.get("secret"), secret);
  assert.equal(query.searchParams.get("issuer"), "Mooral");
  assert.equal(query.searchParams.get("digits"), "6");
  assert.equal(query.searchParams.get("period"), "30");
});

test("recovery codes are unique, formatted and hashed over their dense form", () => {
  const codes = generateRecoveryCodes();
  assert.equal(codes.length, RECOVERY_CODE_COUNT);
  assert.equal(new Set(codes).size, codes.length);
  for (const code of codes) {
    assert.match(code, /^[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}$/);
    assert.ok(looksLikeRecoveryCode(code));
  }

  const first = codes[0]!;
  assert.equal(normaliseRecoveryCode(first.toLowerCase()), normaliseRecoveryCode(first));
  assert.equal(normaliseRecoveryCode(` ${first} `), normaliseRecoveryCode(first));
  assert.deepEqual(hashRecoveryCode(first), hashRecoveryCode(first.toLowerCase()));
  assert.notDeepEqual(hashRecoveryCode(first), hashRecoveryCode(codes[1]!));
  assert.equal(formatRecoveryCode(normaliseRecoveryCode(first)), first);
  assert.equal(looksLikeRecoveryCode("ABC"), false);
});

test("a TOTP secret is sealed with AES-GCM and only the key opens it", () => {
  const key = developmentSecretsKey();
  const sealed = sealSecret("JBSWY3DPEHPK3PXP", key);
  assert.match(sealed, /^v1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
  assert.equal(openSecret(sealed, key), "JBSWY3DPEHPK3PXP");

  // A different key, a tampered ciphertext and a re-labelled blob must all fail closed.
  const otherKey = parseSecretsKey(Buffer.alloc(32, 7).toString("base64"))!;
  assert.throws(() => openSecret(sealed, otherKey));
  assert.throws(() => openSecret(sealed.replace(/v1\./, "v2."), key));
  const parts = sealed.split(".");
  const tampered = [parts[0], parts[1], parts[2], `${parts[3]!.slice(0, -2)}AA`].join(".");
  assert.throws(() => openSecret(tampered, key));
});

test("a key must be exactly 32 bytes of base64", () => {
  assert.equal(parseSecretsKey(undefined), null);
  assert.equal(parseSecretsKey("short"), null);
  assert.equal(parseSecretsKey(Buffer.alloc(16).toString("base64")), null);
  assert.equal(parseSecretsKey(Buffer.alloc(32, 1).toString("base64"))?.length, 32);
  assert.equal(parseSecretsKey(Buffer.alloc(32, 1).toString("base64url"))?.length, 32);
});
