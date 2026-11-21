/**
 * The browser's only way to talk to the server: `/api/v1`, the session cookie, and an
 * error object that keeps the server's code so a screen can translate it.
 *
 * The client never sends a business id. The server derives the active business from the
 * session (ADR-0015); the only business value that travels is a slug during login.
 */

export type Role = "owner" | "manager" | "accountant" | "employee";

export interface TenantSummary {
  id: string;
  slug: string;
  name: string;
}

export interface LoginInput {
  email: string;
  password: string;
  /** Only needed when the account belongs to more than one business. */
  tenantSlug?: string;
}

export interface LoginResult {
  /** "session" means the cookie is set and the portal can load; "mfa" means one more step. */
  kind: "session" | "mfa";
  user?: { id: string; email: string };
  tenant?: TenantSummary;
  role?: Role;
  expiresAt?: string;
  challenge?: MfaChallenge;
}

export interface MfaEnrollment {
  secret: string;
  secretDisplay: string;
  otpauthUri: string;
  issuer: string;
  account: string;
  digits: number;
  periodSeconds: number;
}

export interface MfaChallenge {
  status: "verify" | "enroll";
  challengeToken: string;
  expiresAt: string;
  enrollment?: MfaEnrollment;
}

export interface MfaResult {
  expiresAt: string;
  /** Returned once, by enrolment only; the server keeps only hashes. */
  recoveryCodes?: string[];
}

export interface Me {
  user: { id: string; email: string };
  tenant: TenantSummary;
  role: Role;
  permissions: Record<string, unknown>;
  expiresAt: string;
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

export type OrgPatch = Partial<
  Pick<
    OrgSettings,
    | "legalName"
    | "bin"
    | "address"
    | "phone"
    | "email"
    | "numberingSystem"
    | "fiscalYearStartMonth"
    | "vatRegistered"
  >
>;

export interface DashboardSummary {
  business: {
    name: string;
    slug: string;
    legalName: string | null;
    bin: string | null;
    currency: string;
    numberingSystem: "bengali" | "latin";
    fiscalYearStartMonth: number;
    vatRegistered: boolean;
  };
  team: { active: number; byRole: Record<Role, number> };
  activity: Array<{ id: string; action: string; entity: string; createdAt: string }>;
  session: { email: string; role: Role; expiresAt: string };
}

export class ApiClientError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: Record<string, unknown>;
  readonly requestId?: string;
  readonly retryAfterSeconds?: number;

  constructor(
    status: number,
    code: string,
    message: string,
    extra: { details?: Record<string, unknown>; requestId?: string; retryAfterSeconds?: number } = {}
  ) {
    super(message);
    this.name = "ApiClientError";
    this.status = status;
    this.code = code;
    this.details = extra.details;
    this.requestId = extra.requestId;
    this.retryAfterSeconds = extra.retryAfterSeconds;
  }

  /** A 409 from login carries the businesses the account may open. */
  get tenantChoices(): TenantSummary[] | null {
    if (this.status !== 409) return null;
    const tenants = this.details?.["tenants"];
    if (!Array.isArray(tenants)) return null;
    return tenants.filter(isTenantSummary);
  }
}

function isTenantSummary(value: unknown): value is TenantSummary {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate["id"] === "string" &&
    typeof candidate["slug"] === "string" &&
    typeof candidate["name"] === "string"
  );
}

interface ErrorBody {
  error?: {
    code?: unknown;
    message?: unknown;
    request_id?: unknown;
    details?: unknown;
  };
}

export interface ApiClientOptions {
  /** Defaults to the same-origin `/api/v1`; tests pass a fake fetch instead. */
  baseUrl?: string;
  fetchImpl?: typeof fetch;
}

export type ApiClient = ReturnType<typeof createApiClient>;

export function createApiClient(options: ApiClientOptions = {}) {
  const baseUrl = (options.baseUrl ?? "/api/v1").replace(/\/$/, "");
  const fetchImpl = options.fetchImpl ?? ((...args: Parameters<typeof fetch>) => fetch(...args));

  async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
    let response: Response;
    try {
      response = await fetchImpl(`${baseUrl}${path}`, {
        ...init,
        credentials: "same-origin",
        headers: {
          accept: "application/json",
          ...(init.body === undefined ? {} : { "content-type": "application/json" }),
          ...(init.headers ?? {}),
        },
      });
    } catch {
      throw new ApiClientError(0, "network_error", "the server could not be reached");
    }

    if (response.status === 204) return undefined as T;

    const text = await response.text();
    let body: unknown = null;
    if (text) {
      try {
        body = JSON.parse(text);
      } catch {
        body = null;
      }
    }

    if (!response.ok) {
      const parsed = (body ?? {}) as ErrorBody;
      const error = parsed.error ?? {};
      const details =
        typeof error.details === "object" && error.details !== null
          ? (error.details as Record<string, unknown>)
          : undefined;
      const retryAfter = Number(response.headers.get("retry-after") ?? "");
      throw new ApiClientError(
        response.status,
        typeof error.code === "string" ? error.code : "http_error",
        typeof error.message === "string" ? error.message : `request failed (${response.status})`,
        {
          details,
          requestId: typeof error.request_id === "string" ? error.request_id : undefined,
          retryAfterSeconds: Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : undefined,
        }
      );
    }

    return body as T;
  }

  return {
    async login(input: LoginInput): Promise<LoginResult> {
      const body = await request<{
        user?: { id: string; email: string };
        tenant?: TenantSummary;
        role?: Role;
        expires_at?: string;
        mfa?: {
          status: "verify" | "enroll";
          challenge_token: string;
          expires_at: string;
          enrollment?: {
            secret: string;
            secret_display: string;
            otpauth_uri: string;
            issuer: string;
            account: string;
            digits: number;
            period_seconds: number;
          };
        };
      }>("/auth/login", {
        method: "POST",
        body: JSON.stringify({
          email: input.email,
          password: input.password,
          ...(input.tenantSlug ? { tenant_slug: input.tenantSlug } : {}),
        }),
      });

      if (body.mfa) {
        return {
          kind: "mfa",
          challenge: {
            status: body.mfa.status,
            challengeToken: body.mfa.challenge_token,
            expiresAt: body.mfa.expires_at,
            enrollment: body.mfa.enrollment
              ? {
                  secret: body.mfa.enrollment.secret,
                  secretDisplay: body.mfa.enrollment.secret_display,
                  otpauthUri: body.mfa.enrollment.otpauth_uri,
                  issuer: body.mfa.enrollment.issuer,
                  account: body.mfa.enrollment.account,
                  digits: body.mfa.enrollment.digits,
                  periodSeconds: body.mfa.enrollment.period_seconds,
                }
              : undefined,
          },
        };
      }

      return {
        kind: "session",
        user: body.user,
        tenant: body.tenant,
        role: body.role,
        expiresAt: body.expires_at,
      };
    },

    /** Second stage of a sign-in: a TOTP code or one recovery code. */
    async mfaVerify(input: { challengeToken: string; code: string }): Promise<MfaResult> {
      const body = await request<{ expires_at: string }>("/auth/mfa/verify", {
        method: "POST",
        body: JSON.stringify({ challenge_token: input.challengeToken, code: input.code }),
      });
      return { expiresAt: body.expires_at };
    },

    /** First-factor enrolment: confirm the secret's first code and receive recovery codes. */
    async mfaEnroll(input: { challengeToken: string; code: string }): Promise<MfaResult> {
      const body = await request<{ expires_at: string; recovery_codes: string[] }>(
        "/auth/mfa/enroll",
        {
          method: "POST",
          body: JSON.stringify({ challenge_token: input.challengeToken, code: input.code }),
        }
      );
      return { expiresAt: body.expires_at, recoveryCodes: body.recovery_codes };
    },

    async me(): Promise<Me> {
      const body = await request<{
        user: { id: string; email: string };
        tenant: TenantSummary;
        role: Role;
        permissions: Record<string, unknown>;
        session: { expires_at: string };
      }>("/me");
      return {
        user: body.user,
        tenant: body.tenant,
        role: body.role,
        permissions: body.permissions,
        expiresAt: body.session.expires_at,
      };
    },

    async logout(): Promise<void> {
      await request<void>("/auth/logout", { method: "POST" });
    },

    async getDashboard(): Promise<DashboardSummary> {
      const body = await request<{ dashboard: DashboardSummary }>("/dashboard");
      return body.dashboard;
    },

    async getOrg(): Promise<OrgSettings> {
      const body = await request<{ org: OrgSettings }>("/org");
      return body.org;
    },

    async updateOrg(patch: OrgPatch): Promise<OrgSettings> {
      const body = await request<{ org: OrgSettings }>("/org", {
        method: "PATCH",
        body: JSON.stringify(patch),
      });
      return body.org;
    },
  };
}
