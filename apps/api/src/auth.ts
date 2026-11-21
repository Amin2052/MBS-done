/**
 * Login, session resolution and logout (ADR-0015).
 *
 * The active business is resolved from the session row and a live membership row here,
 * server-side. A tenant id sent by the browser is only ever compared against the list this
 * function already computed — it is never used to set `app.tenant_id` on its own.
 */
import type { Db, Tx } from "../../../packages/data/src/db.ts";
import { withCapability, withTenant } from "../../../packages/data/src/db.ts";
import {
  dummyPasswordHash,
  hashPassword,
  verifyPassword,
} from "../../../packages/domain/src/auth/password.ts";
import {
  SESSION_TTL_SECONDS,
  hashEmail,
  hashSessionToken,
  looksLikeEmail,
  normaliseEmail,
  tokenCapabilityValue,
} from "../../../packages/domain/src/auth/session.ts";
import { ApiError, invalidRequest } from "./errors.ts";
import { createMfaFlow, type MfaChallengeBody, type MfaSignIn } from "./mfa.ts";
import { issueSession, type SessionRole } from "./session.ts";

export interface AuthOptions {
  db: Db;
  /** Key that seals TOTP secrets (ADR-0017). Never the database's own key. */
  mfaKey: Buffer;
  now?: () => Date;
  sessionTtlSeconds?: number;
  /** Failures before the address is locked, and for how long. */
  lockThreshold?: number;
  lockSeconds?: number;
  mfaIssuer?: string;
  challengeTtlSeconds?: number;
  mfaMaxAttempts?: number;
}

export interface RequestMeta {
  ip?: string | null;
  userAgent?: string | null;
  requestId: string;
}

export interface TenantSummary {
  id: string;
  slug: string;
  name: string;
}

export interface SessionContext {
  sessionId: string;
  tenant: TenantSummary;
  user: { id: string; email: string };
  role: "owner" | "manager" | "accountant" | "employee";
  permissions: Record<string, unknown>;
  expiresAt: string;
}

export interface LoginSession {
  kind: "session";
  token: string;
  expiresAt: string;
  tenant: TenantSummary;
  user: { id: string; email: string };
  role: SessionContext["role"];
}

/** Either a session, or the next step a privileged account must complete first. */
export type LoginResult =
  | LoginSession
  | { kind: "mfa"; challenge: MfaChallengeBody };

export type { MfaSignIn };

interface MembershipRow {
  tenant_id: string;
  role: SessionContext["role"];
  status: string;
  permissions: Record<string, unknown>;
}

interface TenantRow {
  id: string;
  slug: string;
  name: string;
  status: string;
}

interface SessionRow {
  id: string;
  tenant_id: string;
  user_id: string;
  expires_at: string | Date;
  revoked_at: string | Date | null;
}

function toDate(value: string | Date): Date {
  return value instanceof Date ? value : new Date(value);
}

async function tenantSummary(db: Db, tenantId: string): Promise<TenantRow | null> {
  const result = await db.query<TenantRow>(
    "select id, slug, name, status from platform.tenant_by_id($1)",
    [tenantId]
  );
  return result.rows[0] ?? null;
}

/** Active memberships with their tenant's slug, name and status. */
async function activeMemberships(
  db: Db,
  userId: string
): Promise<Array<MembershipRow & { tenant: TenantRow }>> {
  const rows = await withCapability(db, "app.user_id", userId, async (tx: Tx) => {
    const result = await tx.query<MembershipRow>(
      "select tenant_id, role, status, permissions from tenant.memberships where user_id = $1",
      [userId]
    );
    return result.rows;
  });

  const active: Array<MembershipRow & { tenant: TenantRow }> = [];
  for (const row of rows) {
    if (row.status !== "active") continue;
    const tenant = await tenantSummary(db, row.tenant_id);
    if (!tenant || tenant.status !== "active") continue;
    active.push({ ...row, tenant });
  }
  return active;
}

export function createAuthService(options: AuthOptions) {
  const db = options.db;
  const now = options.now ?? (() => new Date());
  const ttl = options.sessionTtlSeconds ?? SESSION_TTL_SECONDS;
  const lockThreshold = options.lockThreshold ?? 5;
  const lockSeconds = options.lockSeconds ?? 900;

  /** The business and role a challenge is bound to, re-proved at code time. */
  async function resolveContext(userId: string, tenantId: string) {
    const tenant = await tenantSummary(db, tenantId);
    if (!tenant || tenant.status !== "active") return null;
    const rows = await withCapability(db, "app.user_id", userId, async (tx: Tx) => {
      const result = await tx.query<{
        tenant_id: string;
        role: SessionRole;
        status: string;
      }>("select tenant_id, role, status from tenant.memberships where user_id = $1", [userId]);
      return result.rows;
    });
    const membership = rows.find((row) => row.tenant_id === tenantId);
    if (!membership || membership.status !== "active") return null;
    return {
      tenant: { id: tenant.id, slug: tenant.slug, name: tenant.name },
      role: membership.role,
    };
  }

  const mfa = createMfaFlow({
    db,
    key: options.mfaKey,
    now,
    issuer: options.mfaIssuer,
    challengeTtlSeconds: options.challengeTtlSeconds,
    maxAttempts: options.mfaMaxAttempts,
    lockThreshold,
    lockSeconds,
    sessionTtlSeconds: ttl,
    resolveContext,
  });

  async function login(
    input: { email?: unknown; password?: unknown; tenantSlug?: unknown },
    meta: RequestMeta
  ): Promise<LoginResult> {
    const email = typeof input.email === "string" ? normaliseEmail(input.email) : "";
    const password = typeof input.password === "string" ? input.password : "";
    const tenantSlug =
      typeof input.tenantSlug === "string" && input.tenantSlug.trim()
        ? input.tenantSlug.trim().toLowerCase()
        : null;

    if (!email || !password) throw invalidRequest("email and password are required");
    if (!looksLikeEmail(email)) throw invalidRequest("email is not a valid address");

    const emailHash = hashEmail(email);
    const lookup = await db.query<{
      id: string;
      password_hash: string;
      status: string;
      mfa_enrolled_at: string | Date | null;
      locked_until: string | Date | null;
      failures: number;
    }>("select * from platform.login_lookup($1, $2)", [email, emailHash]);
    const account = lookup.rows[0];

    if (!account) {
      // Same work as a real verification, so a missing account is not detectably faster.
      await verifyPassword(password, await dummyPasswordHash());
      throw new ApiError(401, "invalid_credentials", "email or password is incorrect");
    }

    if (account.locked_until && toDate(account.locked_until) > now()) {
      const seconds = Math.max(
        1,
        Math.ceil((toDate(account.locked_until).getTime() - now().getTime()) / 1000)
      );
      throw new ApiError(429, "too_many_attempts", "too many failed attempts; try again later", {
        headers: { "retry-after": String(seconds) },
      });
    }

    const verified = await verifyPassword(password, account.password_hash);
    if (!verified) {
      const failure = await db.query<{ failures: number; locked_until: string | Date | null }>(
        "select failures, locked_until from platform.login_record_failure($1, $2, $3, $4)",
        [emailHash, lockThreshold, lockSeconds, now()]
      );
      const locked = failure.rows[0]?.locked_until;
      if (locked && toDate(locked) > now()) {
        throw new ApiError(429, "too_many_attempts", "too many failed attempts; try again later", {
          headers: { "retry-after": String(lockSeconds) },
        });
      }
      throw new ApiError(401, "invalid_credentials", "email or password is incorrect");
    }

    if (account.status !== "active") {
      throw new ApiError(403, "account_unavailable", "this account cannot sign in");
    }

    await db.query("select platform.login_record_success($1)", [emailHash]);

    const memberships = await activeMemberships(db, account.id);
    if (memberships.length === 0) {
      throw new ApiError(403, "no_business_access", "this account has no active business");
    }

    let chosen = memberships[0];
    if (tenantSlug) {
      const match = memberships.find((row) => row.tenant.slug === tenantSlug);
      if (!match) {
        throw new ApiError(403, "tenant_not_available", "this account has no access to that business");
      }
      chosen = match;
    } else if (memberships.length > 1) {
      throw new ApiError(409, "tenant_required", "choose a business to continue", {
        details: {
          tenants: memberships.map((row) => ({
            id: row.tenant.id,
            slug: row.tenant.slug,
            name: row.tenant.name,
          })),
        },
      });
    }

    const profile = await db.query<{ id: string; email: string; status: string }>(
      "select id, email, status from platform.user_profile($1)",
      [account.id]
    );
    const user = profile.rows[0];
    if (!user) throw new ApiError(401, "invalid_credentials", "email or password is incorrect");

    const tenant: TenantSummary = {
      id: chosen.tenant.id,
      slug: chosen.tenant.slug,
      name: chosen.tenant.name,
    };

    // Owners and managers cannot turn the second factor off by forgetting it: an account
    // with no confirmed TOTP credential is sent to enrolment instead of a session.
    if (chosen.role === "owner" || chosen.role === "manager") {
      const challenge = await mfa.begin({
        user,
        tenant,
        role: chosen.role,
        emailHash,
        meta,
      });
      return { kind: "mfa", challenge };
    }

    const issued = await issueSession({
      db,
      userId: account.id,
      tenant,
      role: chosen.role,
      strength: "password",
      meta,
      now,
      ttlSeconds: ttl,
    });

    return {
      kind: "session",
      token: issued.token,
      expiresAt: issued.expiresAt,
      tenant,
      user: { id: user.id, email: user.email },
      role: chosen.role,
    };
  }

  async function verifyMfa(input: {
    challengeToken: unknown;
    code: unknown;
    meta: RequestMeta;
  }): Promise<MfaSignIn> {
    return mfa.verify(input);
  }

  async function enrollMfa(input: {
    challengeToken: unknown;
    code: unknown;
    meta: RequestMeta;
  }): Promise<MfaSignIn & { recoveryCodes: string[] }> {
    return mfa.enroll(input);
  }

  /**
   * Turn a cookie into a server-verified context. The token hash is applied as a
   * transaction-local capability, so the query can see exactly one session row and nothing
   * else in any tenant.
   */
  async function resolveSession(token: string | undefined): Promise<SessionContext | null> {
    if (!token) return null;
    const capability = tokenCapabilityValue(token);

    const found = await withCapability(db, "app.session_token_hash", capability, async (tx) => {
      const result = await tx.query<SessionRow>(
        `select id, tenant_id, user_id, expires_at, revoked_at
         from tenant.sessions
         where token_hash = decode($1, 'hex')
         limit 1`,
        [hashSessionToken(token)]
      );
      return result.rows[0] ?? null;
    });

    if (!found) return null;
    if (found.revoked_at) return null;
    if (toDate(found.expires_at) <= now()) return null;

    return withTenant(db, found.tenant_id, async (tx) => {
      const membership = await tx.query<{
        role: SessionContext["role"];
        status: string;
        permissions: Record<string, unknown>;
      }>(
        "select role, status, permissions from tenant.memberships where user_id = $1 limit 1",
        [found.user_id]
      );
      const row = membership.rows[0];
      if (!row || row.status !== "active") return null;

      // Both lookups are SECURITY DEFINER calls, so they work inside the tenant
      // transaction without adding a second connection round trip.
      const profile = await tx.query<{ id: string; email: string; status: string }>(
        "select id, email, status from platform.user_profile($1)",
        [found.user_id]
      );
      const user = profile.rows[0];
      if (!user || user.status !== "active") return null;

      const tenantRow = await tx.query<TenantRow>(
        "select id, slug, name, status from platform.tenant_by_id($1)",
        [found.tenant_id]
      );
      const tenant = tenantRow.rows[0];
      if (!tenant || tenant.status !== "active") return null;

      const session = await tx.query<{ last_seen_at: string | Date }>(
        "select last_seen_at from tenant.sessions where id = $1",
        [found.id]
      );
      const lastSeen = session.rows[0]?.last_seen_at;
      if (!lastSeen || now().getTime() - toDate(lastSeen).getTime() > 60_000) {
        await tx.query("update tenant.sessions set last_seen_at = now() where id = $1", [found.id]);
      }

      return {
        sessionId: found.id,
        tenant: { id: tenant.id, slug: tenant.slug, name: tenant.name },
        user: { id: user.id, email: user.email },
        role: row.role,
        permissions: row.permissions ?? {},
        expiresAt: toDate(found.expires_at).toISOString(),
      } satisfies SessionContext;
    });
  }

  async function logout(context: SessionContext, meta: RequestMeta): Promise<void> {
    await withTenant(db, context.tenant.id, async (tx) => {
      await tx.query(
        "update tenant.sessions set revoked_at = now() where id = $1 and revoked_at is null",
        [context.sessionId]
      );
      await tx.query(
        `insert into tenant.audit_log
           (tenant_id, actor_user_id, action, entity, entity_id, request_id)
         values ($1, $2, 'auth.logout', 'session', $3, $4)`,
        [context.tenant.id, context.user.id, context.sessionId, meta.requestId]
      );
    });
  }

  return { login, verifyMfa, enrollMfa, resolveSession, logout, hashPassword };
}

export type AuthService = ReturnType<typeof createAuthService>;
