/**
 * The first `/api/v1` routes (ADR-0009): login, logout, the signed-in user, the business
 * profile and the two second-factor steps. Every route below reads the tenant from the
 * session context — no route accepts a business id from the caller.
 */
import type { Db, Tx } from "../../../packages/data/src/db.ts";
import { withTenant } from "../../../packages/data/src/db.ts";
import {
  clearSessionCookie,
  serializeSessionCookie,
} from "../../../packages/domain/src/auth/session.ts";
import type { AuthService, RequestMeta, SessionContext } from "./auth.ts";
import { ApiError, invalidRequest } from "./errors.ts";

export interface RouteContext {
  db: Db;
  auth: AuthService;
  session: SessionContext | null;
  body: unknown;
  cookies: Record<string, string>;
  query: URLSearchParams;
  meta: RequestMeta;
}

export interface RouteResult {
  status: number;
  body?: unknown;
  cookies?: string[];
  headers?: Record<string, string>;
}

export interface RouteDefinition {
  method: "GET" | "POST" | "PATCH" | "DELETE";
  path: string;
  operationId: string;
  summary: string;
  /** true means a valid session cookie is required. */
  auth: boolean;
  handler(context: RouteContext): Promise<RouteResult>;
}

export interface OrgSettings {
  legalName: string | null;
  bin: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
  currency: string;
  timezone: string;
  numberingSystem: "bengali" | "latin";
  fiscalYearStartMonth: number;
  vatRegistered: boolean;
  updatedAt: string;
}

interface OrgRow {
  legal_name: string | null;
  bin: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
  currency: string;
  timezone: string;
  numbering_system: "bengali" | "latin";
  fiscal_year_start_month: number;
  vat_registered: boolean;
  updated_at: string | Date;
}

const ORG_COLUMNS = `legal_name, bin, address, phone, email, currency, timezone,
  numbering_system, fiscal_year_start_month, vat_registered, updated_at`;

function toOrgSettings(row: OrgRow): OrgSettings {
  return {
    legalName: row.legal_name,
    bin: row.bin,
    address: row.address,
    phone: row.phone,
    email: row.email,
    currency: row.currency,
    timezone: row.timezone,
    numberingSystem: row.numbering_system,
    fiscalYearStartMonth: row.fiscal_year_start_month,
    vatRegistered: row.vat_registered,
    updatedAt: new Date(row.updated_at).toISOString(),
  };
}

async function loadOrg(tx: Tx, tenantId: string): Promise<OrgSettings> {
  const result = await tx.query<OrgRow>(
    `select ${ORG_COLUMNS} from tenant.org_settings where tenant_id = $1`,
    [tenantId]
  );
  const row = result.rows[0];
  if (!row) throw new ApiError(404, "org_not_configured", "this business has no profile yet");
  return toOrgSettings(row);
}

const ORG_TEXT_FIELDS = {
  legalName: "legal_name",
  bin: "bin",
  address: "address",
  phone: "phone",
  email: "email",
} as const;

const ORG_MAX_LENGTH: Record<keyof typeof ORG_TEXT_FIELDS, number> = {
  legalName: 120,
  bin: 40,
  address: 400,
  phone: 40,
  email: 254,
};

/** Whitelisted patch: unknown keys are an error, not silently ignored. */
function readOrgPatch(body: unknown): Array<[string, unknown]> {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    throw invalidRequest("body must be a JSON object");
  }
  const input = body as Record<string, unknown>;
  const allowed = new Set([
    ...Object.keys(ORG_TEXT_FIELDS),
    "numberingSystem",
    "fiscalYearStartMonth",
    "vatRegistered",
  ]);
  const unknownKeys = Object.keys(input).filter((key) => !allowed.has(key));
  if (unknownKeys.length) throw invalidRequest(`unknown field(s): ${unknownKeys.join(", ")}`);
  if (Object.keys(input).length === 0) throw invalidRequest("no fields to update");

  const updates: Array<[string, unknown]> = [];
  for (const [field, column] of Object.entries(ORG_TEXT_FIELDS)) {
    if (!(field in input)) continue;
    const value = input[field];
    if (value === null) {
      updates.push([column, null]);
      continue;
    }
    if (typeof value !== "string") throw invalidRequest(`${field} must be a string or null`);
    if (value.length > ORG_MAX_LENGTH[field as keyof typeof ORG_TEXT_FIELDS]) {
      throw invalidRequest(`${field} is too long`);
    }
    updates.push([column, value.trim() === "" ? null : value.trim()]);
  }
  if ("numberingSystem" in input) {
    if (input.numberingSystem !== "bengali" && input.numberingSystem !== "latin") {
      throw invalidRequest("numberingSystem must be bengali or latin");
    }
    updates.push(["numbering_system", input.numberingSystem]);
  }
  if ("fiscalYearStartMonth" in input) {
    const month = input.fiscalYearStartMonth;
    if (typeof month !== "number" || !Number.isInteger(month) || month < 1 || month > 12) {
      throw invalidRequest("fiscalYearStartMonth must be an integer between 1 and 12");
    }
    updates.push(["fiscal_year_start_month", month]);
  }
  if ("vatRegistered" in input) {
    if (typeof input.vatRegistered !== "boolean") {
      throw invalidRequest("vatRegistered must be a boolean");
    }
    updates.push(["vat_registered", input.vatRegistered]);
  }
  return updates;
}

export function createRoutes(options: { auth: AuthService; secureCookies: boolean }): RouteDefinition[] {
  const { auth } = options;
  const secure = options.secureCookies;

  return [
    {
      method: "GET",
      path: "/api/v1/health",
      operationId: "getHealth",
      summary: "Liveness probe; no session required and no business data",
      auth: false,
      handler: async () => ({ status: 200, body: { status: "ok" } }),
    },
    {
      method: "POST",
      path: "/api/v1/auth/login",
      operationId: "login",
      summary:
        "Exchange email, password and optionally a business slug for a session cookie, or for the second-factor step",
      auth: false,
      handler: async ({ auth: service, body, meta }) => {
        if (typeof body !== "object" || body === null) {
          throw invalidRequest("body must be a JSON object");
        }
        const input = body as Record<string, unknown>;
        const result = await service.login(
          { email: input.email, password: input.password, tenantSlug: input.tenant_slug },
          meta
        );
        if (result.kind === "mfa") {
          // No cookie yet: the password alone is not a session for a privileged account.
          return { status: 200, body: { mfa: result.challenge } };
        }
        return {
          status: 200,
          body: {
            user: result.user,
            tenant: result.tenant,
            role: result.role,
            expires_at: result.expiresAt,
          },
          cookies: [serializeSessionCookie(result.token, { secure })],
        };
      },
    },
    {
      method: "POST",
      path: "/api/v1/auth/mfa/verify",
      operationId: "verifyMfa",
      summary: "Complete a sign-in that asked for a TOTP or recovery code",
      auth: false,
      handler: async ({ auth: service, body, meta }) => {
        if (typeof body !== "object" || body === null) {
          throw invalidRequest("body must be a JSON object");
        }
        const input = body as Record<string, unknown>;
        const result = await service.verifyMfa({
          challengeToken: input.challenge_token,
          code: input.code,
          meta,
        });
        return {
          status: 200,
          body: {
            tenant: result.tenant,
            role: result.role,
            expires_at: result.expiresAt,
          },
          cookies: [serializeSessionCookie(result.token, { secure })],
        };
      },
    },
    {
      method: "POST",
      path: "/api/v1/auth/mfa/enroll",
      operationId: "enrollMfa",
      summary: "Confirm the first TOTP code, activate the factor and return recovery codes",
      auth: false,
      handler: async ({ auth: service, body, meta }) => {
        if (typeof body !== "object" || body === null) {
          throw invalidRequest("body must be a JSON object");
        }
        const input = body as Record<string, unknown>;
        const result = await service.enrollMfa({
          challengeToken: input.challenge_token,
          code: input.code,
          meta,
        });
        return {
          status: 200,
          body: {
            tenant: result.tenant,
            role: result.role,
            expires_at: result.expiresAt,
            recovery_codes: result.recoveryCodes,
          },
          cookies: [serializeSessionCookie(result.token, { secure })],
        };
      },
    },
    {
      method: "POST",
      path: "/api/v1/auth/logout",
      operationId: "logout",
      summary: "Revoke the current session",
      auth: true,
      handler: async ({ auth: service, session, meta }) => {
        if (session) await service.logout(session, meta);
        return { status: 204, cookies: [clearSessionCookie({ secure })] };
      },
    },
    {
      method: "GET",
      path: "/api/v1/me",
      operationId: "getMe",
      summary: "The signed-in user, the active business and the role in it",
      auth: true,
      handler: async ({ session }) => {
        if (!session) throw new ApiError(401, "unauthenticated", "sign in first");
        return {
          status: 200,
          body: {
            user: { id: session.user.id, email: session.user.email },
            tenant: session.tenant,
            role: session.role,
            permissions: session.permissions,
            session: { expires_at: session.expiresAt },
          },
        };
      },
    },
    {
      method: "GET",
      path: "/api/v1/org",
      operationId: "getOrgSettings",
      summary: "Business profile for the active business",
      auth: true,
      handler: async ({ db, session }) => {
        if (!session) throw new ApiError(401, "unauthenticated", "sign in first");
        const settings = await withTenant(db, session.tenant.id, (tx) =>
          loadOrg(tx, session.tenant.id)
        );
        return { status: 200, body: { org: settings } };
      },
    },
    {
      method: "PATCH",
      path: "/api/v1/org",
      operationId: "updateOrgSettings",
      summary: "Update whitelisted business profile fields (owner only)",
      auth: true,
      handler: async ({ db, session, body, meta }) => {
        if (!session) throw new ApiError(401, "unauthenticated", "sign in first");
        if (session.role !== "owner" && session.role !== "manager") {
          throw new ApiError(403, "forbidden", "only an owner or manager may change the profile");
        }
        const updates = readOrgPatch(body);
        const columns = updates.map(([column]) => column);
        const values = updates.map(([, value]) => value);

        return withTenant(db, session.tenant.id, async (tx) => {
          const before = await loadOrg(tx, session.tenant.id);
          const assignments = columns.map((column, index) => `${column} = $${index + 2}`).join(", ");
          await tx.query(
            `update tenant.org_settings set ${assignments}, updated_at = now() where tenant_id = $1`,
            [session.tenant.id, ...values]
          );
          const after = await loadOrg(tx, session.tenant.id);
          await tx.query(
            `insert into tenant.audit_log
               (tenant_id, actor_user_id, action, entity, entity_id, before, after, request_id)
             values ($1, $2, 'org.update', 'org_settings', $3, $4::jsonb, $5::jsonb, $6)`,
            [
              session.tenant.id,
              session.user.id,
              session.tenant.id,
              JSON.stringify(before),
              JSON.stringify(after),
              meta.requestId,
            ]
          );
          return { status: 200, body: { org: after } };
        });
      },
    },
  ];
}
