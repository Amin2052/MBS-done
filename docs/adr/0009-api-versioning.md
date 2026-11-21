# ADR-0009 — API style, versioning and concurrency

**Status:** Accepted · **Date:** 2026-11-21 · **Class:** D1 · **Reversibility:** medium

## Context

Spec 5.2 requires a versioned REST API under `/api/v1`, contract-first OpenAPI, schema
validation on every input, a non-leaking error format, cursor pagination, idempotency keys
on money-moving requests and optimistic concurrency on editable records. Three clients
will consume it (owner portal, employee portal, admin portal) plus the future desktop app.

## Options considered

| Option | Assessment |
|---|---|
| tRPC | Excellent DX inside one TypeScript repo, but ties clients to the server build and makes a public/third-party API awkward. |
| GraphQL | Powerful for varied clients; adds query-cost, N+1 and authorisation complexity that must be solved per field. |
| **REST + OpenAPI 3.1** | Boring, cacheable, testable, and generates typed clients. Matches the legacy Worker's `/v1/*` shape. |

## Decision

- REST, JSON, versioned path `/api/v1`; breaking changes require `/api/v2`, additive
  changes do not bump.
- OpenAPI 3.1 is the contract; generated from Zod schemas with `@asteasolutions/zod-to-openapi`
  so validation and documentation cannot drift.
- Errors: `{ "error": { "code": "invoice_not_found", "message": "…", "requestId": "…" } }`
  — no stack traces, no SQL, no internal ids that leak other tenants.
- Lists use **cursor pagination** (`?cursor=…&limit=…`), never offset.
- Money-moving requests require an `Idempotency-Key` header, stored with the response
  for 24 hours and replayed on duplicate.
- Editable records carry a `version` integer; `PATCH` with a stale version returns 409.
- Every response includes `X-Request-Id`, echoed in logs and errors.

## Consequences

- The employee app (currently `mbs-user/shared/api-client.ts`) is rewritten against this
  contract at M9.
- Rate limiting is per-route-class (auth, read, write) and per-tenant, returning 429 with
  `Retry-After`.
- Long-running operations return 202 + a job id, with `GET /jobs/{id}` for status.

## Sources

- https://spec.openapis.org/oas/v3.1.0.html (checked 2026-11-21)
- https://www.rfc-editor.org/rfc/rfc9457 (problem details, considered; the custom envelope above is simpler for clients, checked 2026-11-21)
