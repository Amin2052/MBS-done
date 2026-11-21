/**
 * Password hashing (ADR-0004): Argon2id, 19 MiB, t=2, p=1, 32-byte output, 16-byte salt.
 *
 * hash-wasm is used rather than a native binding: the parameters live in the encoded PHC
 * string, so the algorithm is still the decision recorded in the ADR and the deployment has
 * no compiler step. Verification reads the parameters back from the stored string, which
 * lets the cost be raised later without invalidating existing hashes.
 */
import { randomBytes } from "node:crypto";
import { argon2id, argon2Verify } from "hash-wasm";

export const PASSWORD_PARAMS = {
  memorySize: 19456,
  iterations: 2,
  parallelism: 1,
  hashLength: 32,
  saltBytes: 16,
} as const;

/** ASVS 5.0: 12 characters minimum when other factors are optional. */
export const PASSWORD_MIN_LENGTH = 12;
export const PASSWORD_MAX_LENGTH = 256;

export class PasswordError extends Error {}

/** Bengali and other scripts have canonically equivalent spellings; hash one of them. */
function normalise(password: string): string {
  return password.normalize("NFKC");
}

export function assertPasswordAcceptable(password: string): void {
  if (typeof password !== "string") throw new PasswordError("password must be a string");
  if (password.length < PASSWORD_MIN_LENGTH) {
    throw new PasswordError(`password must be at least ${PASSWORD_MIN_LENGTH} characters`);
  }
  if (password.length > PASSWORD_MAX_LENGTH) {
    throw new PasswordError(`password must be at most ${PASSWORD_MAX_LENGTH} characters`);
  }
  if (password.trim().length === 0) throw new PasswordError("password must not be blank");
}

export async function hashPassword(password: string): Promise<string> {
  assertPasswordAcceptable(password);
  return argon2id({
    password: normalise(password),
    salt: randomBytes(PASSWORD_PARAMS.saltBytes),
    memorySize: PASSWORD_PARAMS.memorySize,
    iterations: PASSWORD_PARAMS.iterations,
    parallelism: PASSWORD_PARAMS.parallelism,
    hashLength: PASSWORD_PARAMS.hashLength,
    outputType: "encoded",
  });
}

/**
 * Verify a password against a stored hash. A malformed or foreign hash is a failed
 * verification, never an exception the caller has to remember to catch.
 */
export async function verifyPassword(password: string, encodedHash: string): Promise<boolean> {
  if (typeof password !== "string" || typeof encodedHash !== "string") return false;
  if (!encodedHash.startsWith("$argon2id$")) return false;
  try {
    return await argon2Verify({ password: normalise(password), hash: encodedHash });
  } catch {
    return false;
  }
}

let dummyHash: Promise<string> | null = null;

/**
 * A real hash of a throwaway password, used when the email is unknown so that a login for
 * a missing account costs the same time as one for an existing account.
 */
export function dummyPasswordHash(): Promise<string> {
  dummyHash ??= hashPassword("mbs-timing-equaliser-not-a-real-password");
  return dummyHash;
}
