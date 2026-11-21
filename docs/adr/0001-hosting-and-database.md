# ADR-0001 — Hosting model and database engine

**Status:** Accepted · **Date:** 2026-11-21 · **Class:** D1 · **Reversibility:** high
(the application talks SQL through one driver, so the placement of the runtime can change)

## Context

The legacy product is an Electron desktop app with a local SQLite file plus a Cloudflare
Worker + D1 sync API (`cloudflare/wrangler.toml`, `worker/index.js`, 1,087 lines). The
audit found workspace isolation only partially implemented and money stored as `REAL`.

The NEW product must be multi-tenant, must render Bangla PDFs, must run ETL over legacy
databases, and must run background jobs (PDF batches, ETL rehearsals, restores). Spec 5.4
requires comparing Workers+Hyperdrive, a Node server next to PostgreSQL, and D1-per-tenant.

## Options considered

| Option | Fit |
|---|---|
| **A. Workers + Hyperdrive → PostgreSQL** | Global edge latency; but no long-running work, CPU/time limits per request, and Hyperdrive's transaction-mode pooling constrains session state. Documented limits: no session-level advisory locks, no SQL-level `PREPARE`/`DEALLOCATE`/`EXECUTE`, no `LISTEN`/`NOTIFY`; `SET` only lasts for a transaction or a single query; long transactions starve the pool. |
| **B. Node service beside PostgreSQL (single region)** | Full control of transactions, connection pool, workers and PDF rendering; simplest mental model for RLS (`BEGIN; SELECT set_config('app.tenant_id', $1, true); …`); no edge caching to reason about. |
| **C. D1 per tenant** | Nice isolation story, but no RLS, no joins across tenants (unneeded), and it contradicts the single-cluster assumption in spec 3.3; also locks the product to Cloudflare. |

## Decision

Take **option B**: one authenticated TypeScript modular monolith (`apps/api`) on Node LTS,
single region (Singapore, closest to Bangladesh), against **PostgreSQL 18** (current
supported major, 18.7 at time of writing, supported to 2030-11-14). Neon/Supabase-style
managed Postgres or a self-hosted cluster are both compatible; that is an infrastructure
choice for M15, not an architecture choice.

Hyperdrive is explicitly **not** adopted for v1. The spec's requirement that tenant
context be transaction-local `set_config(..., true)` is satisfied natively by a direct
connection; if Workers are added later, the same code path still works because it never
relies on session state.

## Consequences

- Tenant context is set inside every request/job transaction, never on a session.
- Row locks (`SELECT … FOR UPDATE`) are used for invoice counters and stock, never
  advisory locks — which keeps the option of Hyperdrive open.
- Heavy work (PDF batches, ETL, restores) runs in a worker process, not in a request.
- Deployment is a single Node process group + PostgreSQL; IaC and runbooks in M15.
- The legacy Cloudflare Worker/D1 keeps running, untouched, until each business is
  migrated.

## Reversibility

High. The data layer is plain SQL over `pg`/Kysely, so moving the runtime to Workers +
Hyperdrive later requires no schema change, only a connection-string swap and adherence
to the already-imposed constraints.

## Sources

- https://www.postgresql.org/docs/18/release-18-7.html (checked 2026-11-21)
- https://endoflife.date/postgresql — 18 supported to 2030-11-14 (checked 2026-11-21)
- https://developers.cloudflare.com/hyperdrive/concepts/connection-pooling (checked 2026-11-21)
- https://developers.cloudflare.com/hyperdrive/reference/supported-databases-and-features (checked 2026-11-21)
