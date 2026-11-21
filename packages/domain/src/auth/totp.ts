/**
 * TOTP (RFC 6238) over HOTP (RFC 4226), with no dependency outside `node:crypto`.
 *
 * Choices that are security decisions rather than defaults:
 *   - SHA-1, 6 digits, 30 seconds: what every authenticator app implements, and what
 *     RFC 6238's reference configuration specifies. It is not the HMAC choice that makes
 *     a TOTP secret weak; its length and secrecy do.
 *   - a 20-byte (160-bit) secret, the RFC 4226 recommendation.
 *   - a one-step window, so a phone whose clock is up to 30 seconds out still works;
 *     anything wider starts to help a guesser more than a user.
 *   - replay is refused: a code is only accepted for a step strictly newer than the last
 *     step this credential used (the caller passes `lastUsedStep`).
 */
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export const TOTP_ISSUER = "Mooral";
export const TOTP_SECRET_BYTES = 20;

export interface TotpConfig {
  digits: number;
  periodSeconds: number;
  /** Steps accepted either side of the current one. */
  windowSteps: number;
}

export const TOTP_DEFAULTS: TotpConfig = { digits: 6, periodSeconds: 30, windowSteps: 1 };

/** RFC 4648 §6, no padding: authenticator apps expect an unpadded secret. */
export function base32Encode(bytes: Uint8Array): string {
  let bits = 0;
  let value = 0;
  let output = "";
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  return output;
}

export function base32Decode(input: string): Uint8Array {
  const cleaned = input.replace(/[\s-]/g, "").replace(/=+$/, "").toUpperCase();
  if (cleaned.length === 0) throw new Error("empty base32 value");
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];
  for (const character of cleaned) {
    const index = BASE32_ALPHABET.indexOf(character);
    if (index === -1) throw new Error(`not base32: ${character}`);
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Uint8Array.from(bytes);
}

export function generateTotpSecret(bytes: number = TOTP_SECRET_BYTES): string {
  if (!Number.isInteger(bytes) || bytes < 16) throw new RangeError("a TOTP secret needs 16+ bytes");
  return base32Encode(randomBytes(bytes));
}

/** HOTP: HMAC-SHA-1 over the 8-byte big-endian counter, dynamic truncation (RFC 4226 §5.3). */
export function hotp(secret: Uint8Array, counter: number, digits: number = 6): string {
  const message = Buffer.alloc(8);
  const high = Math.floor(counter / 2 ** 32);
  const low = counter >>> 0;
  message.writeUInt32BE(high >>> 0, 0);
  message.writeUInt32BE(low, 4);

  const digest = createHmac("sha1", secret).update(message).digest();
  const offset = digest[digest.length - 1] & 0x0f;
  const binary =
    ((digest[offset] & 0x7f) << 24) |
    ((digest[offset + 1] & 0xff) << 16) |
    ((digest[offset + 2] & 0xff) << 8) |
    (digest[offset + 3] & 0xff);
  return String(binary % 10 ** digits).padStart(digits, "0");
}

export function currentStep(atMs: number, periodSeconds: number = 30): number {
  return Math.floor(atMs / 1000 / periodSeconds);
}

export function totpCodeAt(
  secret: string,
  atMs: number,
  config: Pick<TotpConfig, "digits" | "periodSeconds"> = TOTP_DEFAULTS
): string {
  return hotp(base32Decode(secret), currentStep(atMs, config.periodSeconds), config.digits);
}

/** Spaces and dashes are how people type a code they read off a screen. */
export function normaliseTotpCode(input: string, digits: number = 6): string | null {
  const cleaned = input.replace(/[\s-]/g, "");
  return new RegExp(`^\\d{${digits}}$`).test(cleaned) ? cleaned : null;
}

export interface TotpCheckInput {
  secret: string;
  code: string;
  atMs: number;
  /** The step this credential last spent; a code from it or earlier is a replay. */
  lastUsedStep?: number | null;
  config?: TotpConfig;
}

export interface TotpCheckResult {
  ok: boolean;
  /** The step the accepted code belonged to, for replay protection. */
  step: number | null;
  reason?: "format" | "mismatch" | "replay" | "bad_secret";
}

function equalConstantTime(left: string, right: string): boolean {
  const a = Buffer.from(left, "utf8");
  const b = Buffer.from(right, "utf8");
  return a.length === b.length && timingSafeEqual(a, b);
}

export function checkTotpCode(input: TotpCheckInput): TotpCheckResult {
  const config = input.config ?? TOTP_DEFAULTS;
  const code = normaliseTotpCode(input.code, config.digits);
  if (!code) return { ok: false, step: null, reason: "format" };

  let secret: Uint8Array;
  try {
    secret = base32Decode(input.secret);
  } catch {
    return { ok: false, step: null, reason: "bad_secret" };
  }

  const current = currentStep(input.atMs, config.periodSeconds);
  let matched: number | null = null;
  for (let offset = config.windowSteps; offset >= -config.windowSteps; offset -= 1) {
    const step = current + offset;
    if (step < 0) continue;
    if (equalConstantTime(hotp(secret, step, config.digits), code)) {
      matched = step;
      break;
    }
  }
  if (matched === null) return { ok: false, step: null, reason: "mismatch" };

  if (typeof input.lastUsedStep === "number" && matched <= input.lastUsedStep) {
    return { ok: false, step: null, reason: "replay" };
  }
  return { ok: true, step: matched };
}

/**
 * `otpauth://` URI for the manual-entry path. The label is `issuer:account`, which is what
 * apps display, and both are percent-encoded so an email with `+` or `@` survives.
 */
export function otpauthUri(options: {
  secret: string;
  account: string;
  issuer?: string;
  config?: Pick<TotpConfig, "digits" | "periodSeconds">;
}): string {
  const config = options.config ?? TOTP_DEFAULTS;
  const issuer = options.issuer ?? TOTP_ISSUER;
  const label = `${encodeURIComponent(issuer)}:${encodeURIComponent(options.account)}`;
  const query = new URLSearchParams({
    secret: options.secret,
    issuer,
    algorithm: "SHA1",
    digits: String(config.digits),
    period: String(config.periodSeconds),
  });
  return `otpauth://totp/${label}?${query.toString()}`;
}

/** Groups a base32 secret in fours: people read it out, so it must be readable. */
export function formatSecretForDisplay(secret: string): string {
  return (secret.match(/.{1,4}/g) ?? [secret]).join(" ");
}
