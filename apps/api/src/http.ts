/**
 * The HTTP layer: a small router over `node:http`. No framework, because the surface is
 * eight routes and every response header below is a security decision worth seeing.
 *
 * Applied to every response: no-store (personalised data must never be cached), CSP
 * `default-src 'none'`, no framing, no referrer, nosniff, and a request id the audit log
 * can be correlated with.
 */
import { randomUUID } from "node:crypto";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { Db } from "../../../packages/data/src/db.ts";
import { developmentSecretsKey } from "../../../packages/domain/src/auth/secret-box.ts";
import { parseCookies } from "../../../packages/domain/src/auth/session.ts";
import { createAuthService, type AuthService } from "./auth.ts";
import { ApiError } from "./errors.ts";
import { createRoutes, type RouteDefinition, type RouteResult } from "./routes.ts";
import { openApiDocument } from "./openapi.ts";
import { createStaticHandler, type StaticHandler } from "./static.ts";

const MAX_BODY_BYTES = 16 * 1024;
const JSON_CONTENT_TYPE = /^application\/json\s*(?:;|$)/i;

export interface ApiOptions {
  db: Db;
  secureCookies?: boolean;
  sessionTtlSeconds?: number;
  lockThreshold?: number;
  lockSeconds?: number;
  /** Seals TOTP secrets. The entry point refuses the development key in production. */
  mfaKey?: Buffer;
  mfaIssuer?: string;
  challengeTtlSeconds?: number;
  mfaMaxAttempts?: number;
  now?: () => Date;
  /** Directory of the built owner portal; absent means this process serves only the API. */
  webRoot?: string;
  /** Called for unexpected failures; the response itself never carries the detail. */
  onError?: (error: unknown, requestId: string) => void;
}

interface Handler {
  routes: RouteDefinition[];
  byKey: Map<string, RouteDefinition>;
  auth: AuthService;
  openapi: Record<string, unknown>;
}

export function buildHandler(options: ApiOptions): Handler {
  const auth = createAuthService({
    db: options.db,
    mfaKey: options.mfaKey ?? developmentSecretsKey(),
    now: options.now,
    sessionTtlSeconds: options.sessionTtlSeconds,
    lockThreshold: options.lockThreshold,
    lockSeconds: options.lockSeconds,
    mfaIssuer: options.mfaIssuer,
    challengeTtlSeconds: options.challengeTtlSeconds,
    mfaMaxAttempts: options.mfaMaxAttempts,
  });
  const routes = createRoutes({ auth, secureCookies: options.secureCookies ?? true });
  const byKey = new Map(routes.map((route) => [`${route.method} ${route.path}`, route]));
  return { routes, byKey, auth, openapi: openApiDocument(routes) };
}

function baseHeaders(requestId: string): Record<string, string> {
  return {
    "cache-control": "no-store",
    "content-type": "application/json; charset=utf-8",
    "x-request-id": requestId,
    "x-content-type-options": "nosniff",
    "x-frame-options": "DENY",
    "referrer-policy": "no-referrer",
    "content-security-policy": "default-src 'none'; frame-ancestors 'none'",
  };
}

async function readJsonBody(request: IncomingMessage): Promise<unknown> {
  const contentType = request.headers["content-type"] ?? "";
  if (!JSON_CONTENT_TYPE.test(contentType)) {
    throw new ApiError(415, "unsupported_media_type", "content-type must be application/json");
  }
  const declared = Number(request.headers["content-length"] ?? "0");
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) {
    throw new ApiError(413, "payload_too_large", `body must be at most ${MAX_BODY_BYTES} bytes`);
  }

  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const buffer = chunk as Buffer;
    size += buffer.length;
    if (size > MAX_BODY_BYTES) {
      throw new ApiError(413, "payload_too_large", `body must be at most ${MAX_BODY_BYTES} bytes`);
    }
    chunks.push(buffer);
  }
  if (size === 0) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new ApiError(400, "invalid_json", "body is not valid JSON");
  }
}

function send(
  response: ServerResponse,
  status: number,
  body: unknown,
  headers: Record<string, string>,
  cookies: string[] = []
): void {
  const payload = body === undefined ? "" : JSON.stringify(body);
  const outgoing: Record<string, string | string[]> = { ...headers };
  if (cookies.length) outgoing["set-cookie"] = cookies;
  if (status === 204) {
    delete outgoing["content-type"];
  } else {
    outgoing["content-length"] = String(Buffer.byteLength(payload));
  }
  response.writeHead(status, outgoing);
  response.end(status === 204 ? undefined : payload);
}

export function createRequestListener(options: ApiOptions) {
  const handler = buildHandler(options);
  const serveStatic: StaticHandler | null = options.webRoot
    ? createStaticHandler({ root: options.webRoot })
    : null;
  const onError =
    options.onError ??
    ((error: unknown, requestId: string) => {
      console.error(`[${requestId}] unhandled:`, error instanceof Error ? error.stack : error);
    });

  return async function listener(request: IncomingMessage, response: ServerResponse) {
    const requestId = randomUUID();
    const headers = baseHeaders(requestId);
    const url = new URL(request.url ?? "/", "http://placeholder.invalid");

    try {
      if (url.pathname === "/api/v1/openapi.json") {
        send(response, 200, handler.openapi, headers);
        return;
      }

      // The owner portal shares this origin. Static first so `/` and deep links load the
      // app; the handler declines anything under `/api/`.
      if (serveStatic && (await serveStatic(request, response))) return;

      const method = (request.method ?? "GET").toUpperCase();
      const route = handler.byKey.get(`${method} ${url.pathname}`);
      if (!route) {
        const pathExists = handler.routes.some((candidate) => candidate.path === url.pathname);
        if (pathExists) {
          send(
            response,
            405,
            { error: { code: "method_not_allowed", message: `use ${allowedFor(handler, url.pathname)}` } },
            { ...headers, allow: allowedFor(handler, url.pathname) },
            []
          );
          return;
        }
        send(response, 404, { error: { code: "not_found", message: "no such endpoint" } }, headers);
        return;
      }

      const body = method === "GET" || method === "DELETE" ? undefined : await readJsonBody(request);
      const cookies = parseCookies(request.headers.cookie);
      const session = route.auth
        ? await handler.auth.resolveSession(cookies["mbs_session"])
        : null;
      if (route.auth && !session) {
        throw new ApiError(401, "unauthenticated", "sign in first");
      }

      const result: RouteResult = await route.handler({
        db: options.db,
        auth: handler.auth,
        session,
        body,
        cookies,
        query: url.searchParams,
        meta: {
          ip: request.socket.remoteAddress ?? null,
          userAgent: request.headers["user-agent"] ?? null,
          requestId,
        },
      });

      send(
        response,
        result.status,
        result.body,
        { ...headers, ...(result.headers ?? {}) },
        result.cookies ?? []
      );
    } catch (error) {
      if (error instanceof ApiError) {
        const body: Record<string, unknown> = {
          error: { code: error.code, message: error.message, request_id: requestId },
        };
        if (error.details !== undefined) body["error"] = { ...(body["error"] as object), details: error.details };
        send(response, error.status, body, { ...headers, ...(error.headers ?? {}) });
        return;
      }
      onError(error, requestId);
      send(
        response,
        500,
        { error: { code: "internal_error", message: "something went wrong", request_id: requestId } },
        headers
      );
    }
  };
}

function allowedFor(handler: Handler, path: string): string {
  return handler.routes
    .filter((route) => route.path === path)
    .map((route) => route.method)
    .join(", ");
}

export function createApiServer(options: ApiOptions) {
  return createServer(createRequestListener(options));
}
