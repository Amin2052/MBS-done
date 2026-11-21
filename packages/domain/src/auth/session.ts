/**
 * Session tokens and cookies (ADR-0004).
 *
 * The token is 32 random bytes, sent once to the browser as an opaque cookie. Only its
 * sha256 is stored, so a database copy does not yield usable sessions. The stored value is
 * `bytea`; the capability setting carries the same value in PostgreSQL's `\x` hex form.
 */
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

export const SESSION_COOKIE = "mbs_session";
export const SESSION_TTL_SECONDS = 8 * 60 * 60;

export function createSessionToken(): string {
  return randomBytes(32).toString("base64url");
}

/** sha256 of the token as lowercase hex — the only form that touches storage. */
export function hashSessionToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

/** `\x` + hex is how PostgreSQL reads a bytea literal, so the policy cast matches. */
export function tokenCapabilityValue(token: string): string {
  return `\\x${hashSessionToken(token)}`;
}

export function tokensMatch(a: string, b: string): boolean {
  const left = Buffer.from(hashSessionToken(a), "hex");
  const right = Buffer.from(hashSessionToken(b), "hex");
  return left.length === right.length && timingSafeEqual(left, right);
}

/** Lowercase sha256 of the normalised address: the login throttle's primary key. */
export function hashEmail(email: string): string {
  return createHash("sha256").update(normaliseEmail(email), "utf8").digest("hex");
}

export function normaliseEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function looksLikeEmail(email: string): boolean {
  const value = normaliseEmail(email);
  return value.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export function serializeSessionCookie(
  token: string,
  options: { secure: boolean; maxAgeSeconds?: number } = { secure: true }
): string {
  const maxAge = options.maxAgeSeconds ?? SESSION_TTL_SECONDS;
  const parts = [
    `${SESSION_COOKIE}=${token}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Strict",
    `Max-Age=${maxAge}`,
  ];
  if (options.secure) parts.push("Secure");
  return parts.join("; ");
}

export function clearSessionCookie(options: { secure: boolean } = { secure: true }): string {
  return serializeSessionCookie("", { secure: options.secure, maxAgeSeconds: 0 });
}

export function parseCookies(header: string | undefined): Record<string, string> {
  if (!header) return {};
  const jar: Record<string, string> = {};
  for (const part of header.split(";")) {
    const at = part.indexOf("=");
    if (at === -1) continue;
    const name = part.slice(0, at).trim();
    if (!name) continue;
    jar[name] = decodeURIComponent(part.slice(at + 1).trim());
  }
  return jar;
}
