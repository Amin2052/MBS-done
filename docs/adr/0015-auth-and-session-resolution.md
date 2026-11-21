# ADR-0015 — Authentication, session resolution and pre-authentication capabilities

- **Status:** Accepted
- **Date:** 2026-11-21
- **Class:** D1 (technical, reversible without data loss)
- **Related:** ADR-0001 (Node + PostgreSQL), ADR-0002 (Kysely + `pg`), ADR-0004 (Argon2id,
  opaque sessions), ADR-0009 (REST `/api/v1`), ADR-0014 (STRIDE)

## Context

Two questions have to be answered before tenant context exists, and the tenancy design
deliberately makes both hard:

1. **Who is this?** Identity lives in `platform.users`, which `app_runtime` has no
   privilege to read. That is on purpose (M3): the application must not be able to browse
   every account in the system.
2. **Which business does this session belong to?** Sessions live in `tenant.sessions`,
   which is protected by `FORCE ROW LEVEL SECURITY` keyed on `app.tenant_id`. The tenant id
   is exactly what the session is supposed to supply.

`FORCE RLS` also applies to the table owner, so "a SECURITY DEFINER function owned by the
migrator can read anything" is false here: a definer function is still subject to the
policies unless the owner has `BYPASSRLS`, which no MBS role has.

## Decision

**Identity reads go through named SECURITY DEFINER functions.** `platform.login_lookup`,
`platform.user_profile`, `platform.tenant_by_id`, `platform.login_record_failure` and
`platform.login_record_success` are owned by the migrator, pin `search_path`, and are the
only way the runtime role touches platform data. Each returns the narrowest possible shape:
a login lookup returns a password verifier and throttle state, not the identity table.

**Tenant rows are reached through two transaction-local capability settings.** The server
sets `app.session_token_hash` (a sha256 of a 256-bit random token) or `app.user_id` (a uuid
it has just verified from a password) for one transaction. Two additive SELECT-only
policies match exactly those rows:

```sql
create policy tenant_sessions_token_lookup on tenant.sessions
  for select using (token_hash = nullif(current_setting('app.session_token_hash', true), '')::bytea);

create policy tenant_memberships_user_lookup on tenant.memberships
  for select using (user_id = nullif(current_setting('app.user_id', true), '')::uuid);
```

A capability can only ever reveal the row it names — never a tenant's other rows — and it
is cleared at transaction end. `tools/check-rls.mjs` fails the build if a capability policy
is anything other than SELECT, if the capability name is not on the allow-list, or if any
setting is applied session-wide.

**The flow.**

```
POST /login  -> platform.login_lookup(email, sha256(email))
             -> argon2id verify (dummy hash when the account is missing, for equal timing)
             -> platform.login_record_failure / _success   (5 failures = 15 minute lock)
             -> memberships: app.user_id capability, then platform.tenant_by_id
             -> tenant chosen here; a slug from the browser is only *matched* against
                this list, never used as a key
             -> withTenant(chosen): insert session (sha256 of token) + audit `auth.login`
             -> Set-Cookie: mbs_session (32 random bytes, HttpOnly, SameSite=Strict, Secure)
GET  /me     -> app.session_token_hash capability -> one session row
             -> withTenant(tenant from that row): live membership check, profile, tenant
```

## Consequences

- The browser never names a business. `tenant_id` in a request body is rejected as an
  unknown field (see the API test), so a confused client cannot cross tenants.
- A stolen database yields no usable sessions (only sha256 hashes) and no passwords
  (Argon2id, 19 MiB / t=2 / p=1, per-hash salt).
- Two extra capability policies exist on `tenant.sessions` and `tenant.memberships`.
  `tools/verify-schema.mjs` asserts both expose exactly one row, and that no capability
  means zero rows.
- Login requires two transactions (capability, then tenant context) instead of one. At
  Bangladeshi SME scale this is not a measurable cost, and it keeps every tenant write
  inside a properly scoped transaction.
- Session lookup by token hash is a unique index hit; the policy adds one comparison.

## Alternatives rejected

- **`BYPASSRLS` service role.** Would make one bug in a query path a cross-tenant breach,
  and is exactly what ADR-0014's elevation-of-privilege strand is about.
- **A tenant id inside a signed cookie/token.** Puts the routing decision in client-held
  state and makes revocation harder; it also duplicates a fact the server can look up.
- **Separate login database or schema without RLS.** Splits identity from membership, which
  is the join the product needs on every request.
- **Refresh tokens in v1.** An 8-hour session with a sliding `last_seen_at` is enough for
  the first release; rotation is a v2 decision with a real client.

## Open items

- MFA (TOTP, passkeys, recovery codes) is stored-for-ready but not shipped: the schema has
  `platform.users.mfa_enrolled_at` and the login path already reads it. Wire it next.
- `ip_hash` / `user_agent_hash` are unsalted sha256. Fine for correlating a session's
  origin, not for legal identification; revisit with the PDPO review (ADR-0012).
- No CSRF token: `SameSite=Strict` plus a JSON-only content type is the v1 defence.
  Re-examine if any cross-site form post is ever added.
