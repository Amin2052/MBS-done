/**
 * At-rest protection for TOTP secrets.
 *
 * A TOTP secret is a bearer credential that lives forever: whoever reads it can generate
 * valid codes from that moment on. It is therefore never stored as plain text — it is
 * sealed with AES-256-GCM using a key that lives outside the database (`MBS_MFA_KEY`), so
 * a database dump or a backup taken without the key yields nothing usable.
 *
 * The sealed form is `v1.<iv>.<tag>.<ciphertext>`, base64url, with a random 96-bit IV per
 * value. The AAD is the format version, so a blob cannot be re-labelled and reinterpreted.
 */
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

const VERSION = "v1";
const IV_BYTES = 12;
const TAG_BYTES = 16;
export const SECRET_KEY_BYTES = 32;

export function parseSecretsKey(value: string | undefined | null): Buffer | null {
  if (!value) return null;
  const normalised = value.trim().replace(/-/g, "+").replace(/_/g, "/");
  const key = Buffer.from(normalised, "base64");
  if (key.length !== SECRET_KEY_BYTES) return null;
  return key;
}

/**
 * Development-only key, derived from a constant that is in the repository on purpose: it
 * exists so `npm run dev:api` and the test suite can run with no configuration. The API
 * refuses to start with it when `NODE_ENV=production`, so it cannot quietly protect real
 * owners' second factors.
 */
export function developmentSecretsKey(): Buffer {
  return createHash("sha256").update("mbs development-only mfa key", "utf8").digest();
}

export function isDevelopmentKey(key: Buffer): boolean {
  return key.equals(developmentSecretsKey());
}

export function sealSecret(secret: string, key: Buffer): string {
  if (key.length !== SECRET_KEY_BYTES) throw new RangeError("the sealing key must be 32 bytes");
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(Buffer.from(VERSION, "utf8"));
  const ciphertext = Buffer.concat([cipher.update(secret, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [VERSION, iv.toString("base64url"), tag.toString("base64url"), ciphertext.toString("base64url")].join(
    "."
  );
}

export function openSecret(sealed: string, key: Buffer): string {
  const parts = sealed.split(".");
  if (parts.length !== 4 || parts[0] !== VERSION) throw new Error("unrecognised sealed secret");
  const iv = Buffer.from(parts[1], "base64url");
  const tag = Buffer.from(parts[2], "base64url");
  const ciphertext = Buffer.from(parts[3], "base64url");
  if (iv.length !== IV_BYTES || tag.length !== TAG_BYTES) throw new Error("malformed sealed secret");

  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAAD(Buffer.from(VERSION, "utf8"));
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
}
