/**
 * The second factor (ADR-0017).
 *
 * A sign-in for an owner or manager is a two-stage exchange:
 *
 *   1. the password is verified, and instead of a session the server returns a short-lived
 *      challenge token — plus, for an account with no confirmed factor, the new TOTP secret
 *      to enrol;
 *   2. the code (or a recovery code) is verified against that challenge, which is then
 *      spent and replaced by the session cookie.
 *
 * Nothing about the account is exposed before the password is right, no challenge survives
 * its first use, a challenge for a user invalidates that user's previous one, and wrong
 * codes feed the same per-address throttle the password uses — so the second factor cannot
 * be ground down by opening challenges repeatedly.
 */
import type { Db } from "../../../packages/data/src/db.ts";
import {
  generateRecoveryCodes,
  hashRecoveryCode,
  looksLikeRecoveryCode,
} from "../../../packages/domain/src/auth/recovery.ts";
import { openSecret, sealSecret } from "../../../packages/domain/src/auth/secret-box.ts";
import { createSessionToken, hashSessionToken } from "../../../packages/domain/src/auth/session.ts";
import {
  TOTP_DEFAULTS,
  TOTP_ISSUER,
  checkTotpCode,
  formatSecretForDisplay,
  generateTotpSecret,
  otpauthUri,
} from "../../../packages/domain/src/auth/totp.ts";
import type { RequestMeta, TenantSummary } from "./auth.ts";
import { ApiError, invalidRequest } from "./errors.ts";
import { issueSession, type IssuedSession, type SessionRole } from "./session.ts";

export interface MfaEnrollment {
  secret: string;
  secret_display: string;
  otpauth_uri: string;
  issuer: string;
  account: string;
  digits: number;
  period_seconds: number;
}

export interface MfaChallengeBody {
  status: "verify" | "enroll";
  challenge_token: string;
  expires_at: string;
  /** Present only while enrolling: the secret exists nowhere else in readable form. */
  enrollment?: MfaEnrollment;
}

export interface MfaContext {
  tenant: TenantSummary;
  role: SessionRole;
}

export interface MfaOptions {
  db: Db;
  /** AES-256-GCM key for TOTP secrets; never stored in the database. */
  key: Buffer;
  now?: () => Date;
  issuer?: string;
  challengeTtlSeconds?: number;
  maxAttempts?: number;
  lockThreshold?: number;
  lockSeconds?: number;
  sessionTtlSeconds?: number;
  /**
   * Re-derives the business and role for (user, tenant) at code time. The browser never
   * names a business at this stage: the challenge row holds the tenant the password step
   * chose, and this function proves the membership is still active.
   */
  resolveContext(userId: string, tenantId: string): Promise<MfaContext | null>;
}

export interface MfaSignIn {
  token: string;
  expiresAt: string;
  tenant: TenantSummary;
  role: SessionRole;
}

interface ChallengeRow {
  user_id: string;
  bound_tenant_id: string;
  purpose: "verify" | "enroll";
  email_hash: string;
  attempts: number;
  expires_at: string | Date;
  consumed_at: string | Date | null;
}

interface CredentialRow {
  secret_ciphertext: string;
  confirmed_at: string | Date | null;
  last_used_step: number | string | null;
}

const MAX_CODE_LENGTH = 64;

function toDate(value: string | Date): Date {
  return value instanceof Date ? value : new Date(value);
}

export function createMfaFlow(options: MfaOptions) {
  const db = options.db;
  const now = options.now ?? (() => new Date());
  const key = options.key;
  const issuer = options.issuer ?? TOTP_ISSUER;
  const ttlSeconds = options.challengeTtlSeconds ?? 300;
  const maxAttempts = options.maxAttempts ?? 5;
  const lockThreshold = options.lockThreshold ?? 5;
  const lockSeconds = options.lockSeconds ?? 900;

  async function challengeRow(token: string): Promise<ChallengeRow | null> {
    const result = await db.query<ChallengeRow>(
      "select user_id, bound_tenant_id, purpose, email_hash, attempts, expires_at, consumed_at\n         from platform.mfa_challenge_lookup(decode($1, 'hex'))",
      [hashSessionToken(token)]
    );
    return result.rows[0] ?? null;
  }

  function assertLive(row: ChallengeRow | null, expected: ChallengeRow["purpose"]): ChallengeRow {
    if (!row || row.purpose !== expected) {
      throw new ApiError(401, "mfa_challenge_invalid", "this sign-in step is no longer valid");
    }
    if (row.consumed_at) {
      throw new ApiError(401, "mfa_challenge_invalid", "this sign-in step has already been used");
    }
    if (toDate(row.expires_at) <= now()) {
      throw new ApiError(401, "mfa_challenge_expired", "this sign-in step has expired");
    }
    return row;
  }

  async function credential(userId: string): Promise<CredentialRow | null> {
    const result = await db.query<CredentialRow>(
      "select secret_ciphertext, confirmed_at, last_used_step from platform.mfa_state($1)",
      [userId]
    );
    return result.rows[0] ?? null;
  }

  /** Wrong code: spend an attempt and feed the same per-address throttle as the password. */
  async function recordFailure(tokenHash: string, row: ChallengeRow): Promise<never> {
    const failure = await db.query<{ attempts: number; exhausted: boolean }>(
      "select attempts, exhausted from platform.mfa_challenge_fail(decode($1, 'hex'), $2)",
      [tokenHash, maxAttempts]
    );
    const locked = await db.query<{ locked_until: string | Date | null }>(
      "select locked_until from platform.login_record_failure($1, $2, $3, $4)",
      [row.email_hash, lockThreshold, lockSeconds, now()]
    );
    const lockedUntil = locked.rows[0]?.locked_until;
    if (lockedUntil && toDate(lockedUntil) > now()) {
      const seconds = Math.max(
        1,
        Math.ceil((toDate(lockedUntil).getTime() - now().getTime()) / 1000)
      );
      throw new ApiError(429, "too_many_attempts", "too many failed attempts; try again later", {
        headers: { "retry-after": String(seconds) },
      });
    }
    const used = Math.max(1, Number(failure.rows[0]?.attempts ?? 1));
    throw new ApiError(401, "mfa_invalid_code", "that code is not valid", {
      details: { attempts_remaining: Math.max(0, maxAttempts - used) },
    });
  }

  async function begin(input: {
    user: { id: string; email: string };
    tenant: TenantSummary;
    role: SessionRole;
    emailHash: string;
    meta: RequestMeta;
  }): Promise<MfaChallengeBody> {
    const state = await credential(input.user.id);
    const enrolled = Boolean(state?.confirmed_at);

    let enrollment: MfaEnrollment | undefined;
    if (!enrolled) {
      // A fresh secret on every enrolment challenge: the old pending one was never
      // confirmed, so nothing legitimate depends on it, and rotating it means a leaked
      // pending secret cannot be used later.
      const secret = generateTotpSecret();
      await db.query("select platform.mfa_enroll_store($1, $2)", [
        input.user.id,
        sealSecret(secret, key),
      ]);
      enrollment = {
        secret,
        secret_display: formatSecretForDisplay(secret),
        otpauth_uri: otpauthUri({ secret, account: input.user.email, issuer }),
        issuer,
        account: input.user.email,
        digits: TOTP_DEFAULTS.digits,
        period_seconds: TOTP_DEFAULTS.periodSeconds,
      };
    }

    const token = createSessionToken();
    const expiresAt = new Date(now().getTime() + ttlSeconds * 1000);
    const created = await db.query<{ expires_at: string | Date }>(
      "select expires_at from platform.mfa_begin($1, decode($2, 'hex'), $3, $4, $5, $6)",
      [
        input.user.id,
        hashSessionToken(token),
        input.tenant.id,
        enrolled ? "verify" : "enroll",
        input.emailHash,
        expiresAt,
      ]
    );

    return {
      status: enrolled ? "verify" : "enroll",
      challenge_token: token,
      expires_at: toDate(created.rows[0]!.expires_at).toISOString(),
      ...(enrollment ? { enrollment } : {}),
    };
  }

  async function contextFor(row: ChallengeRow): Promise<MfaContext> {
    const context = await options.resolveContext(row.user_id, row.bound_tenant_id);
    if (!context) {
      throw new ApiError(403, "no_business_access", "this account has no active business");
    }
    return context;
  }

  /** Shared shape of both stages' success: the session plus what proved it. */
  async function complete(
    row: ChallengeRow,
    input: { tenant: TenantSummary; role: SessionRole; meta: RequestMeta; strength: "totp" | "recovery" }
  ): Promise<IssuedSession> {
    return issueSession({
      db,
      userId: row.user_id,
      tenant: input.tenant,
      role: input.role,
      strength: input.strength,
      meta: input.meta,
      now,
      ttlSeconds: options.sessionTtlSeconds,
    });
  }

  async function verify(input: {
    challengeToken: unknown;
    code: unknown;
    meta: RequestMeta;
  }): Promise<MfaSignIn> {
    if (typeof input.challengeToken !== "string" || !input.challengeToken.trim()) {
      throw invalidRequest("challenge_token is required");
    }
    if (typeof input.code !== "string" || input.code.length > MAX_CODE_LENGTH) {
      throw invalidRequest("code is required");
    }
    const code = input.code.trim();

    const row = assertLive(await challengeRow(input.challengeToken.trim()), "verify");
    const tokenHash = hashSessionToken(input.challengeToken.trim());
    const context = await contextFor(row);
    const state = await credential(row.user_id);
    if (!state?.confirmed_at) {
      throw new ApiError(401, "mfa_challenge_invalid", "this account has no confirmed second factor");
    }

    const secret = openSecret(state.secret_ciphertext, key);
    const lastUsedStep =
      state.last_used_step === null ? null : Number(state.last_used_step);

    const check = checkTotpCode({
      secret,
      code,
      atMs: now().getTime(),
      lastUsedStep,
    });

    if (check.ok && check.step !== null) {
      const consumed = await db.query<{ ok: boolean }>(
        "select platform.mfa_challenge_consume(decode($1, 'hex')) as ok",
        [tokenHash]
      );
      if (!consumed.rows[0]?.ok) {
        throw new ApiError(401, "mfa_challenge_invalid", "this sign-in step has already been used");
      }
      await db.query("select platform.mfa_touch_step($1, $2)", [row.user_id, String(check.step)]);
      const issued = await complete(row, {
        tenant: context.tenant,
        role: context.role,
        meta: input.meta,
        strength: "totp",
      });
      return { ...issued, tenant: context.tenant, role: context.role };
    }

    // A recovery code is a different alphabet from a 6-digit code, so the two never
    // compete: the TOTP check has already rejected it as a format mismatch.
    if (looksLikeRecoveryCode(code)) {
      const spent = await db.query<{ ok: boolean }>(
        "select platform.mfa_recovery_use($1, decode($2, 'hex')) as ok",
        [row.user_id, hashRecoveryCode(code).toString("hex")]
      );
      if (spent.rows[0]?.ok) {
        const consumed = await db.query<{ ok: boolean }>(
          "select platform.mfa_challenge_consume(decode($1, 'hex')) as ok",
          [tokenHash]
        );
        if (!consumed.rows[0]?.ok) {
          throw new ApiError(401, "mfa_challenge_invalid", "this sign-in step has already been used");
        }
        const issued = await complete(row, {
          tenant: context.tenant,
          role: context.role,
          meta: input.meta,
          strength: "recovery",
        });
        return { ...issued, tenant: context.tenant, role: context.role };
      }
    }

    return recordFailure(tokenHash, row);
  }

  async function enroll(input: {
    challengeToken: unknown;
    code: unknown;
    meta: RequestMeta;
  }): Promise<MfaSignIn & { recoveryCodes: string[] }> {
    if (typeof input.challengeToken !== "string" || !input.challengeToken.trim()) {
      throw invalidRequest("challenge_token is required");
    }
    if (typeof input.code !== "string" || input.code.length > MAX_CODE_LENGTH) {
      throw invalidRequest("code is required");
    }
    const token = input.challengeToken.trim();
    const row = assertLive(await challengeRow(token), "enroll");
    const context = await contextFor(row);
    const state = await credential(row.user_id);
    if (!state) throw new ApiError(401, "mfa_challenge_invalid", "no enrolment is in progress");

    const secret = openSecret(state.secret_ciphertext, key);
    const check = checkTotpCode({ secret, code: input.code.trim(), atMs: now().getTime() });
    if (!check.ok || check.step === null) return recordFailure(hashSessionToken(token), row);

    const consumed = await db.query<{ ok: boolean }>(
      "select platform.mfa_challenge_consume(decode($1, 'hex')) as ok",
      [hashSessionToken(token)]
    );
    if (!consumed.rows[0]?.ok) {
      throw new ApiError(401, "mfa_challenge_invalid", "this sign-in step has already been used");
    }

    const codes = generateRecoveryCodes();
    await db.query("select platform.mfa_enroll_confirm($1, $2, $3::text[])", [
      row.user_id,
      String(check.step),
      codes.map((code) => hashRecoveryCode(code).toString("hex")),
    ]);

    const issued = await issueSession({
      db,
      userId: row.user_id,
      tenant: context.tenant,
      role: context.role,
      strength: "totp",
      meta: input.meta,
      now,
      ttlSeconds: options.sessionTtlSeconds,
      auditAction: "auth.mfa_enroll",
      auditAfter: { method: "totp", recovery_codes: codes.length },
    });

    return { ...issued, tenant: context.tenant, role: context.role, recoveryCodes: codes };
  }

  return { begin, verify, enroll };
}

export type MfaFlow = ReturnType<typeof createMfaFlow>;
