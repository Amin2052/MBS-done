/**
 * OpenAPI 3.1 document, generated from the route table so a route cannot ship without an
 * entry. A test fails if the two ever disagree.
 */
import type { RouteDefinition } from "./routes.ts";

const errorSchema = {
  type: "object",
  required: ["error"],
  properties: {
    error: {
      type: "object",
      required: ["code", "message"],
      properties: {
        code: { type: "string" },
        message: { type: "string" },
        request_id: { type: "string" },
        details: { type: "object", additionalProperties: true },
      },
    },
  },
} as const;

const tenantSchema = {
  type: "object",
  required: ["id", "slug", "name"],
  properties: {
    id: { type: "string", format: "uuid" },
    slug: { type: "string" },
    name: { type: "string" },
  },
} as const;

const orgSchema = {
  type: "object",
  required: ["currency", "timezone", "numberingSystem", "fiscalYearStartMonth", "vatRegistered"],
  properties: {
    legalName: { type: ["string", "null"] },
    bin: { type: ["string", "null"] },
    address: { type: ["string", "null"] },
    phone: { type: ["string", "null"] },
    email: { type: ["string", "null"] },
    currency: { type: "string", enum: ["BDT"] },
    timezone: { type: "string", enum: ["Asia/Dhaka"] },
    numberingSystem: { type: "string", enum: ["bengali", "latin"] },
    fiscalYearStartMonth: { type: "integer", minimum: 1, maximum: 12 },
    vatRegistered: { type: "boolean" },
    updatedAt: { type: "string", format: "date-time" },
  },
} as const;

const ERROR_RESPONSES = {
  "400": { description: "Invalid request", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
  "401": { description: "Not signed in", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
  "403": { description: "Not allowed", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
  "429": { description: "Too many attempts", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
  "500": { description: "Unexpected failure", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
} as const;

function requestBodyFor(path: string, method: string) {
  if (method !== "POST" && method !== "PATCH") return undefined;
  if (path === "/api/v1/auth/login") {
    return {
      required: true,
      content: {
        "application/json": {
          schema: {
            type: "object",
            required: ["email", "password"],
            properties: {
              email: { type: "string", format: "email" },
              password: { type: "string", minLength: 12, maxLength: 256 },
              tenant_slug: {
                type: "string",
                description: "Required only when the account belongs to more than one business",
              },
            },
          },
        },
      },
    };
  }
  if (path === "/api/v1/org") {
    return {
      required: true,
      content: {
        "application/json": {
          schema: {
            type: "object",
            minProperties: 1,
            additionalProperties: false,
            properties: {
              legalName: { type: ["string", "null"], maxLength: 120 },
              bin: { type: ["string", "null"], maxLength: 40 },
              address: { type: ["string", "null"], maxLength: 400 },
              phone: { type: ["string", "null"], maxLength: 40 },
              email: { type: ["string", "null"], maxLength: 254 },
              numberingSystem: { type: "string", enum: ["bengali", "latin"] },
              fiscalYearStartMonth: { type: "integer", minimum: 1, maximum: 12 },
              vatRegistered: { type: "boolean" },
            },
          },
        },
      },
    };
  }
  return { required: false, content: { "application/json": { schema: { type: "object" } } } };
}

function successResponse(path: string, method: string) {
  if (method === "POST" && path === "/api/v1/auth/logout") {
    return { "204": { description: "Session revoked" } };
  }
  if (path === "/api/v1/auth/login") {
    return {
      "200": {
        description: "Session created; the cookie carries the opaque token",
        headers: {
          "set-cookie": { schema: { type: "string" }, description: "mbs_session, HttpOnly, SameSite=Strict" },
        },
        content: {
          "application/json": {
            schema: {
              type: "object",
              properties: {
                user: { type: "object", properties: { id: { type: "string" }, email: { type: "string" } } },
                tenant: { $ref: "#/components/schemas/Tenant" },
                role: { type: "string", enum: ["owner", "manager", "accountant", "employee"] },
                expires_at: { type: "string", format: "date-time" },
              },
            },
          },
        },
      },
      "409": {
        description: "The account belongs to several businesses; repeat the login with tenant_slug",
        content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } },
      },
    };
  }
  if (path === "/api/v1/org" && method === "GET") {
    return {
      "200": {
        description: "Business profile",
        content: {
          "application/json": {
            schema: {
              type: "object",
              properties: { org: { $ref: "#/components/schemas/OrgSettings" } },
            },
          },
        },
      },
      "404": { description: "No profile yet", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
    };
  }
  if (path === "/api/v1/org" && method === "PATCH") {
    return {
      "200": {
        description: "Updated profile",
        content: {
          "application/json": {
            schema: {
              type: "object",
              properties: { org: { $ref: "#/components/schemas/OrgSettings" } },
            },
          },
        },
      },
    };
  }
  if (path === "/api/v1/me") {
    return {
      "200": {
        description: "Current session context",
        content: {
          "application/json": {
            schema: {
              type: "object",
              properties: {
                user: { type: "object", properties: { id: { type: "string" }, email: { type: "string" } } },
                tenant: { $ref: "#/components/schemas/Tenant" },
                role: { type: "string" },
                permissions: { type: "object", additionalProperties: true },
                session: { type: "object", properties: { expires_at: { type: "string" } } },
              },
            },
          },
        },
      },
    };
  }
  return {
    "200": {
      description: "OK",
      content: { "application/json": { schema: { type: "object", additionalProperties: true } } },
    },
  };
}

export function openApiDocument(routes: RouteDefinition[]): Record<string, unknown> {
  const paths: Record<string, Record<string, unknown>> = {};
  for (const route of routes) {
    paths[route.path] ??= {};
    const operation: Record<string, unknown> = {
      operationId: route.operationId,
      summary: route.summary,
      tags: [route.path.split("/")[3] === "auth" ? "auth" : route.path.split("/")[3] ?? "root"],
      security: route.auth ? [{ cookieAuth: [] }] : [],
      responses: {
        ...successResponse(route.path, route.method),
        ...(route.auth ? ERROR_RESPONSES : { "400": ERROR_RESPONSES["400"], "500": ERROR_RESPONSES["500"] }),
        "429": ERROR_RESPONSES["429"],
      },
    };
    const body = requestBodyFor(route.path, route.method);
    if (body) operation["requestBody"] = body;
    paths[route.path][route.method.toLowerCase()] = operation;
  }

  return {
    openapi: "3.1.0",
    info: {
      title: "Mooral Business Suite API",
      version: "1.0.0",
      description:
        "Version 1 of the MBS HTTP API. The active business comes from the session cookie; " +
        "no endpoint accepts a tenant id from the caller. Money is always a decimal string.",
    },
    servers: [{ url: "/", description: "Same origin as the application" }],
    tags: [
      { name: "auth", description: "Sign in and out" },
      { name: "me", description: "The signed-in user" },
      { name: "org", description: "Business profile" },
      { name: "health", description: "Liveness" },
    ],
    paths,
    components: {
      securitySchemes: {
        cookieAuth: { type: "apiKey", in: "cookie", name: "mbs_session" },
      },
      schemas: { Error: errorSchema, Tenant: tenantSchema, OrgSettings: orgSchema },
    },
  };
}
