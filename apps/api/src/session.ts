/**
 * Session creation, shared by password-only sign-in and by the second-factor paths, so a
 * session issued after a code is indistinguishable from one issued after a password — same
 * TTL, same hash-only storage, same audit row.
 */
import type { Db, Tx } from "../../../packages/data/src/db.ts";
import { withTenant } from "../../../packages/data/src/db.ts";
import {
  SESSION_TTL_SECONDS,
  createSessionToken,
  hashEmail,
  hashSessionToken,
} from "../../../packages/domain/src/auth/session.ts";
import type { RequestMeta, TenantSummary } from "./auth.ts";

export type SessionRole = "owner" | "manager" | "accountant" | "employee";

/** How the session was proved: password alone, or password plus a factor. */
export type AuthStrength = "password" | "totp" | "recovery";

export interface IssueSessionInput {
  db: Db;
  userId: string;
  tenant: TenantSummary;
  role: SessionRole;
  strength: AuthStrength;
  meta: RequestMeta;
  now: () => Date;
  ttlSeconds?: number;
  /** Extra tenant-scoped audit row for this sign-in (e.g. first-factor enrolment). */
  auditAction?: string;
  auditAfter?: Record<string, unknown>;
}

export interface IssuedSession {
  token: string;
  expiresAt: string;
}

export async function issueSession(input: IssueSessionInput): Promise<IssuedSession> {
  const ttl = input.ttlSeconds ?? SESSION_TTL_SECONDS;
  const token = createSessionToken();
  const tokenHash = hashSessionToken(token);
  const expiresAt = new Date(input.now().getTime() + ttl * 1000);
  const ipHash = input.meta.ip ? hashEmail(`ip:${input.meta.ip}`) : null;
  const userAgentHash = input.meta.userAgent ? hashEmail(`ua:${input.meta.userAgent}`) : null;

  await withTenant(input.db, input.tenant.id, async (tx: Tx) => {
    await tx.query(
      `insert into tenant.sessions
         (tenant_id, user_id, token_hash, expires_at, ip_hash, user_agent_hash)
       values ($1, $2, decode($3, 'hex'), $4,
               case when $5::text is null then null else decode($5::text, 'hex') end,
               case when $6::text is null then null else decode($6::text, 'hex') end)`,
      [input.tenant.id, input.userId, tokenHash, expiresAt, ipHash, userAgentHash]
    );
    await tx.query(
      `insert into tenant.audit_log
         (tenant_id, actor_user_id, action, entity, entity_id, request_id, after)
       values ($1, $2, 'auth.login', 'session', $3, $4, $5::jsonb)`,
      [
        input.tenant.id,
        input.userId,
        input.tenant.id,
        input.meta.requestId,
        JSON.stringify({
          role: input.role,
          tenant: input.tenant.slug,
          strength: input.strength,
        }),
      ]
    );
    if (input.auditAction) {
      await tx.query(
        `insert into tenant.audit_log
           (tenant_id, actor_user_id, action, entity, entity_id, request_id, after)
         values ($1, $2, $3, 'user', $6, $4, $5::jsonb)`,
        [
          input.tenant.id,
          input.userId,
          input.auditAction,
          input.meta.requestId,
          JSON.stringify(input.auditAfter ?? {}),
          // A second placeholder for the same id: entity_id is text while actor_user_id is
          // uuid, and one parameter cannot be deduced as both.
          input.userId,
        ]
      );
    }
  });

  return { token, expiresAt: expiresAt.toISOString() };
}
