/**
 * Recovery codes: the way back in when the phone is lost.
 *
 * Ten codes, 12 characters each from a 30-symbol alphabet that omits look-alikes
 * (no I, L, O, U, 0, 1), so 30^12 ≈ 59 bits of entropy per code. That is far more than
 * enough to make guessing hopeless, and it is why a single sha256 is the right storage
 * form: there is no low-entropy secret to slow an attacker down on, and the codes are
 * checked at most a handful of times in a business's life.
 *
 * The plain codes exist once — in the response that creates them. Nothing else can
 * recover them, so the screen asks the owner to store them before continuing.
 */
import { createHash, randomInt } from "node:crypto";

const ALPHABET = "ABCDEFGHJKMNPQRSTVWXYZ23456789";
export const RECOVERY_CODE_COUNT = 10;
export const RECOVERY_CODE_LENGTH = 12;

export function generateRecoveryCode(): string {
  let code = "";
  for (let index = 0; index < RECOVERY_CODE_LENGTH; index += 1) {
    code += ALPHABET[randomInt(0, ALPHABET.length)];
  }
  return code;
}

/** No duplicates in a batch: a repeated code would silently be spent twice. */
export function generateRecoveryCodes(count: number = RECOVERY_CODE_COUNT): string[] {
  if (!Number.isInteger(count) || count < 1) throw new RangeError("count must be positive");
  const codes = new Set<string>();
  while (codes.size < count) codes.add(formatRecoveryCode(generateRecoveryCode()));
  return [...codes];
}

/** `ABCD-EFGH-JKLM` — grouped for copying onto paper. */
export function formatRecoveryCode(code: string): string {
  const dense = normaliseRecoveryCode(code);
  return (dense.match(/.{1,4}/g) ?? [dense]).join("-");
}

/**
 * Case, spaces and dashes are presentation; the stored hash is over the dense form.
 * Characters outside the alphabet are dropped, so a pasted code with a stray dash or a
 * non-breaking space still works.
 */
export function normaliseRecoveryCode(input: string): string {
  return input.toUpperCase().replace(/[^A-Z0-9]/g, "").replace(/[ILOU01]/g, "");
}

export function hashRecoveryCode(code: string): Buffer {
  return createHash("sha256").update(normaliseRecoveryCode(code), "utf8").digest();
}

export function looksLikeRecoveryCode(input: string): boolean {
  return normaliseRecoveryCode(input).length === RECOVERY_CODE_LENGTH;
}
