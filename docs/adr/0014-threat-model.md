# ADR-0014 — Threat model (STRIDE)

**Status:** Accepted · **Date:** 2026-11-21 · **Class:** D1 · **Reversibility:** n/a
(documentation; revisited at M14 before the penetration test)

## System under analysis

Browser clients (owner, employee, admin) → HTTPS → `apps/api` (Node) → PostgreSQL 18 +
object storage + job worker. Legacy desktop app and Cloudflare Worker/D1 continue to run
in parallel during migration.

Trust boundaries: **B1** browser↔API, **B2** API↔database, **B3** API↔storage,
**B4** worker↔database, **B5** platform admin↔tenant data, **B6** inbound webhooks,
**B7** legacy app↔its own data.

| STRIDE | Threat | Where | Control | Test |
|---|---|---|---|---|
| **Spoofing** | Stolen session cookie used from another device | B1 | Opaque hashed token, `HttpOnly; Secure; SameSite=Lax`, idle timeout, revocation list, session list visible to the user | e2e: reuse a revoked cookie → 401 |
| **Spoofing** | Credential stuffing | B1 | Argon2id, breached-password check, per-account + per-IP rate limit, generic errors | load test at 100 rps login, expect 429 |
| **Spoofing** | MFA bypass via challenge replay | B1 | Single-use 5-minute challenge ticket bound to the user and the partial session | integration: replay ticket → 401 |
| **Spoofing** | Forged billing webhook | B6 | Signature verification, raw-body hashing, replay window, idempotency store | unit: tampered signature → 400, replay → 200 no-op |
| **Tampering** | Cross-tenant write via a crafted `tenant_id` in the body | B1/B2 | Server ignores client tenant ids entirely; RLS `WITH CHECK` rejects mismatches | RLS spike (7/7) + API test with a foreign id → 403 |
| **Tampering** | Invoice edited after issue | B1 | Immutability: no UPDATE policy for issued invoices; corrections via credit/void | integration: UPDATE issued invoice → 0 rows/409 |
| **Tampering** | IDOR on `/invoices/{id}` | B1 | Authorisation check on the owning record, then RLS as the second layer | matrix test: tenant A's id as tenant B → 404 |
| **Repudiation** | Owner denies changing a setting | B1/B2 | `audit_log` with actor, before/after, IP hash, request id; append-only | integration: change setting → exactly one audit row |
| **Information disclosure** | Platform admin reads tenant records | B5 | Separate realm, no grants on tenant tables, break-glass grant ≤ 60 min, read-only, masked columns, business-visible history | test: admin without grant → zero rows; expired grant → zero rows |
| **Information disclosure** | Tenant A sees tenant B in exports, search or PDFs | B1/B2 | Every query goes through `withTenant`; PDFs render from a snapshot fetched inside the tenant transaction | isolation suite (spec 16) |
| **Information disclosure** | Presigned URL shared beyond its life | B3 | 5-minute expiry, per-object key, authorisation before signing | test: expired URL → 403 |
| **Information disclosure** | Personal data in logs | B1–B4 | Structured logging with a redaction allowlist; no request bodies of auth endpoints | log-scan test on a fixture request |
| **Denial of service** | One tenant's bulk export monopolises the API | B1/B2 | Heavy work goes to the job queue; per-tenant concurrency caps; statement timeouts | load test: noisy tenant at 10× |
| **Denial of service** | PDF generation exhausting memory | B4 | Renderer runs in the worker with a per-job timeout and a page cap | worker test: oversized document → job fails, API stays up |
| **Elevation of privilege** | Employee self-grants a permission | B1/B2 | Permission changes require owner role; server authorises every mutation; UI hiding is cosmetic only | matrix: employee PATCH own permissions → 403 |
| **Elevation of privilege** | Session fixation | B1 | New token on login and on privilege change; old token revoked | integration: pre-login token after login → 401 |
| **Elevation of privilege** | Customization payload injects script/CSS | B1 | Server-side schema validation, allowlisted theme ids, no raw CSS/`url()`, unknown fields rejected | customization security suite (M11) |
| **Elevation of privilege** | Electron renderer escapes sandbox | Desktop (M12) | `contextIsolation`, `sandbox`, no `nodeIntegration`, fuses, strict CSP, IPC sender validation | Electronegativity scan |
| **Elevation of privilege** | SSRF through a "fetch preview" feature | B1 | No server-side fetch of user-supplied URLs; if ever needed, allowlist + metadata-IP block | N/A until such a feature exists |

## Highest-risk areas (carry into the penetration test)

1. Tenant boundary under concurrency (needs the real-pool test, open item).
2. Break-glass support access.
3. Webhook handling for billing.
4. File upload and PDF rendering paths.
5. Customization payloads (navigation, dashboard, themes).

## Assumptions

- PostgreSQL is not reachable from the public internet; only the API and worker connect.
- Secrets live in the platform's secret store, never in images or the repository.
- The legacy desktop app is out of scope for NEW controls but remains in the threat
  surface while it runs (its own audit is `security-audit.md`).
