#!/usr/bin/env node
/**
 * tools/mfa-code.mjs — print the current TOTP code for a secret.
 *
 * This exists so the owner portal can be exercised without a phone, and so support can
 * confirm a reported "my code does not work" against the same algorithm. It reads the
 * secret from the argument or `MBS_TOTP_SECRET`; it never reads the database, so it cannot
 * be used to walk every business's credentials.
 *
 * The secret is a credential: printing it to a shared terminal is the same as writing the
 * password on a sticky note. Demo and test secrets only.
 *
 * Usage: npm run mfa:code -- JBSWY3DPEHPK3PXPJBSWY3DP
 */
import { currentStep, totpCodeAt, TOTP_DEFAULTS } from "../packages/domain/src/auth/totp.ts";

const secret = process.argv[2] ?? process.env.MBS_TOTP_SECRET;
if (!secret) {
  console.error("usage: npm run mfa:code -- <base32 secret>");
  process.exit(2);
}

const now = Date.now();
try {
  console.log(totpCodeAt(secret, now));
  const step = currentStep(now, TOTP_DEFAULTS.periodSeconds);
  const elapsed = Math.floor((now / 1000) % TOTP_DEFAULTS.periodSeconds);
  console.error(`valid for ${TOTP_DEFAULTS.periodSeconds - elapsed}s (step ${step})`);
} catch (error) {
  console.error(`not a usable secret: ${error.message}`);
  process.exit(1);
}
