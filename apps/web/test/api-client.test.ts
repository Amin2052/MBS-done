/**
 * The browser client's contract with `/api/v1`: what is sent, what the UI receives, and
 * how a server error is turned into something a screen can translate. `fetch` is a stub,
 * so these tests describe the wire format rather than a running server.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { ApiClientError, createApiClient } from "../src/lib/api.ts";

interface Call {
  url: string;
  init: RequestInit;
}

function stub(responseFor: (url: string, init: RequestInit) => Response | Promise<Response>) {
  const calls: Call[] = [];
  const fetchImpl = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    const request = init ?? {};
    calls.push({ url, init: request });
    return responseFor(url, request);
  }) as typeof fetch;
  return { calls, api: createApiClient({ fetchImpl, baseUrl: "/api/v1" }) };
}

function json(status: number, body: unknown, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });
}

test("login posts the credentials and maps the response", async () => {
  const { api, calls } = stub(() =>
    json(200, {
      user: { id: "u1", email: "owner@alpha.test" },
      tenant: { id: "t1", slug: "alpha", name: "Alpha Traders" },
      role: "owner",
      expires_at: "2026-11-21T20:00:00.000Z",
    })
  );

  const result = await api.login({ email: "owner@alpha.test", password: "secret" });

  assert.equal(calls.length, 1);
  assert.equal(calls[0]?.url, "/api/v1/auth/login");
  assert.equal(calls[0]?.init.method, "POST");
  assert.equal(calls[0]?.init.credentials, "same-origin");
  assert.deepEqual(JSON.parse(String(calls[0]?.init.body)), {
    email: "owner@alpha.test",
    password: "secret",
  });
  assert.equal(result.expiresAt, "2026-11-21T20:00:00.000Z");
  assert.equal(result.tenant.slug, "alpha");
});

test("a multi-business account exposes the business list", async () => {
  const { api } = stub(() =>
    json(409, {
      error: {
        code: "tenant_required",
        message: "choose a business to continue",
        request_id: "req-1",
        details: {
          tenants: [
            { id: "t1", slug: "alpha", name: "Alpha Traders" },
            { id: "t2", slug: "beta", name: "Beta Foods" },
          ],
        },
      },
    })
  );

  const error = await api.login({ email: "both@alpha.test", password: "secret" }).catch((caught) => caught);

  assert.ok(error instanceof ApiClientError);
  assert.equal(error.status, 409);
  assert.equal(error.code, "tenant_required");
  assert.equal(error.requestId, "req-1");
  assert.deepEqual(
    error.tenantChoices?.map((tenant: { slug: string }) => tenant.slug),
    ["alpha", "beta"]
  );
});

test("login sends tenant_slug only after a business was chosen", async () => {
  const { api, calls } = stub(() =>
    json(200, {
      user: { id: "u1", email: "both@alpha.test" },
      tenant: { id: "t2", slug: "beta", name: "Beta Foods" },
      role: "manager",
      expires_at: "2026-11-21T20:00:00.000Z",
    })
  );

  await api.login({ email: "both@alpha.test", password: "secret", tenantSlug: "beta" });
  assert.deepEqual(JSON.parse(String(calls[0]?.init.body)), {
    email: "both@alpha.test",
    password: "secret",
    tenant_slug: "beta",
  });
});

test("a throttle response keeps the retry delay", async () => {
  const { api } = stub(() =>
    json(
      429,
      { error: { code: "too_many_attempts", message: "too many failed attempts; try again later" } },
      { "retry-after": "300" }
    )
  );

  const error = await api.login({ email: "a@b.test", password: "x" }).catch((caught) => caught);
  assert.ok(error instanceof ApiClientError);
  assert.equal(error.retryAfterSeconds, 300);
});

test("a server that cannot be reached becomes status 0, never a raw TypeError", async () => {
  const api = createApiClient({
    baseUrl: "/api/v1",
    fetchImpl: (async () => {
      throw new TypeError("fetch failed");
    }) as typeof fetch,
  });

  const error = await api.me().catch((caught) => caught);
  assert.ok(error instanceof ApiClientError);
  assert.equal(error.status, 0);
  assert.equal(error.code, "network_error");
});

test("me maps the session block, and logout accepts 204", async () => {
  const { api } = stub((url) =>
    url.endsWith("/me")
      ? json(200, {
          user: { id: "u1", email: "owner@alpha.test" },
          tenant: { id: "t1", slug: "alpha", name: "Alpha Traders" },
          role: "owner",
          permissions: { audit: "read" },
          session: { expires_at: "2026-11-22T04:00:00.000Z" },
        })
      : new Response(null, { status: 204 })
  );

  const me = await api.me();
  assert.equal(me.expiresAt, "2026-11-22T04:00:00.000Z");
  assert.deepEqual(me.permissions, { audit: "read" });
  await api.logout();
});

test("updateOrg sends a PATCH with only the changed fields", async () => {
  const { api, calls } = stub(() =>
    json(200, {
      org: {
        legalName: "Alpha Traders Ltd",
        bin: null,
        address: null,
        phone: null,
        email: null,
        currency: "BDT",
        timezone: "Asia/Dhaka",
        numberingSystem: "latin",
        fiscalYearStartMonth: 7,
        vatRegistered: false,
        updatedAt: "2026-11-21T10:00:00.000Z",
      },
    })
  );

  const org = await api.updateOrg({ numberingSystem: "latin" });
  assert.equal(calls[0]?.init.method, "PATCH");
  assert.equal(calls[0]?.url, "/api/v1/org");
  assert.deepEqual(JSON.parse(String(calls[0]?.init.body)), { numberingSystem: "latin" });
  assert.equal(org.numberingSystem, "latin");
});

test("an unreadable error body still yields a usable error", async () => {
  const api = createApiClient({
    baseUrl: "/api/v1",
    fetchImpl: (async () => new Response("<html>bad gateway</html>", { status: 502 })) as typeof fetch,
  });

  const error = await api.getOrg().catch((caught) => caught);
  assert.ok(error instanceof ApiClientError);
  assert.equal(error.status, 502);
  assert.equal(error.code, "http_error");
  assert.match(error.message, /502/);
});
