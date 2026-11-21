# ADR-0004 — Authentication, sessions and MFA

**Status:** Accepted · **Date:** 2026-11-21 · **Class:** D1 · **Reversibility:** medium
(hash upgrades re-hash on next login; session format can change with a forced re-login)

## Context

Legacy: scrypt (N=16384, r=8, p=1) with a self-describing hash string, opaque session
tokens stored only as SHA-256, lockout policy, idle lock, owner recovery key, and a
documented decision **not** to implement TOTP because the product is offline and
single-device. That reasoning does not survive a multi-tenant web SaaS: spec 6.6 requires
MFA for Super Admin and Owners, passkeys/WebAuthn, breached-password rejection, and a
safe MFA-loss recovery path.

OWASP's current recommendation is Argon2id with at least 19 MiB, t=2, p=1 (or scrypt at
N≥2^17, r=8, p=1 if Argon2id is unavailable).

## Options considered

| Area | Options | Chosen |
|---|---|---|
| Password hash | scrypt (status quo), Argon2id, bcrypt, PBKDF2 | **Argon2id**, 19 MiB, t=2, p=1, 32-byte salt, 64-byte output; parameters stored in the hash string so they can be raised later |
| Session | JWT, opaque token in a cookie, token in memory | **Opaque random token** (32 bytes), stored **hashed** (SHA-256) server-side, sent as `HttpOnly; Secure; SameSite=Lax` cookie; rotating on login and on privilege change |
| MFA | TOTP only, WebAuthn only, both | **TOTP + WebAuthn/passkeys**, with 10 single-use recovery codes hashed at rest; MFA mandatory for Super Admin and Owner, owner-configurable for employees |
| Recovery | Email reset only, support-assisted only, both | **Recovery codes → passkey → support-assisted** with identity verification, 24-hour cooling-off and notification, all audited |
| Breach check | none, offline list, k-anonymity API | **k-anonymity range query** against a breached-password corpus at registration/change, fail-open only if the service is unreachable, and logged when it does |

## Decision

Implement the above in `apps/api` with:
- `@node-rs/argon2` (prebuilt, no node-gyp) for hashing.
- `otplib` for TOTP; `@simplewebauthn/server` for passkeys.
- Two-step login: password → MFA challenge ticket (5 min, single use).
- Step-up authentication for: changing password, disabling MFA, adding a passkey,
  exporting tenant data, and break-glass grants.
- Session table: `id`, `user_id`, `tenant_id` (nullable for platform users), `token_hash`,
  `created_at`, `last_seen_at`, `expires_at`, `revoked_at`, `ip_hash`, `user_agent_hash`.
- Absolute lifetime 12 hours, idle timeout 30 minutes, remember-me 30 days.

## Consequences

- Every existing legacy password hash is incompatible; users set a new password at
  first login (argon2id), or the ETL marks the account `must_reset_password`.
- MFA-loss is a real support workflow, not an afterthought — the support-assisted path
  is designed before MFA is switched on for owners.
- The Super Admin realm is separate (spec 6.4): different login endpoint, different
  session cookie name, different role, no tenant data access without a support grant.

## Verification (M4)

- Argon2id parameters asserted from a real hash string.
- MFA bypass attempts: reuse of a challenge ticket, replay of a TOTP code within its
  window, expired recovery code — each must fail.
- Session fixation: a pre-login cookie must not become an authenticated session.
- Cookie flags asserted in an integration test.

## Sources

- https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html (checked 2026-11-21)
- https://www.rfc-editor.org/rfc/rfc6238 (TOTP, checked 2026-11-21)
- https://www.w3.org/TR/webauthn-3/ (checked 2026-11-21)
