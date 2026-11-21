# Security audit — OLD @ `c2871d2`

Scope: the desktop app (Electron main + renderer), the Cloudflare Worker/D1 API, the
employee app, and the licence subsystem. Findings are about OLD; NEW requirements are
stated only where the fix is a redesign.

## Authentication as implemented

| Control | Evidence | Assessment |
|---|---|---|
| Password hashing | `electron/main/auth/security/password.ts` — `scrypt` N=16384, r=8, p=1, 64-byte key, self-describing `scrypt$N$r$p$salt$hash` | Sound KDF choice; spec 6.6 prefers Argon2id for NEW. Parameter is at the low end of modern guidance but not broken |
| Session token | `session-token.ts` — random raw token, **only SHA-256 stored** (`database.ts:1964` comment) | Good: database compromise does not yield usable tokens |
| Session lifecycle | `auth-manager.ts` `revokeSessionByTokenHash`, `session-repository.ts` | Revocation exists |
| Remember me | `session-storage.ts` persists the token between launches | Stored on disk; OS-level protection only |
| Account lockout | `settings/security-settings.tsx`, documented policy (applies to admin/employee, never Owner) | Implemented as policy, owner exempt by design |
| Idle lock | `hooks/use-idle-lock.ts` | Present |
| Password reset | `password-reset-repository.ts`, recovery-key flow in `forgot-password-screen.tsx` (558 lines) | Owner recovery key shown once; no email channel |
| **MFA / TOTP / WebAuthn** | Deliberate non-implementation, documented in `i18n/*.ts` `twoFactorEvaluation` | **Gap for NEW**: spec 6.6 makes MFA mandatory for Super Admin and Owners. Legacy reasoning (single offline device) does not survive a web SaaS |
| Breached-password check | not found | Gap |
| Rate limiting | not found in main or worker | Gap (local app has no login endpoint; the Worker does — check at M2) |

## Authorisation

- Catalogue: `src/auth/permission-catalog.ts` — 11 modules × 7 actions
  (`view, create, edit, delete, approve, print, pdf_export`) = **77 keys**, one source
  of truth, seeded into `permissions`.
- Engine: `src/auth/permission-engine.ts`; Owner bypasses all checks
  (`hasPermission()` short-circuit, per the catalogue comment).
- Profiles: `permission_profiles` + `profile_permissions` + `user_permissions`.
- Route gates: `RequireModuleAccess` on every module route; `RequireBusinessMode`
  (`enterprise`) on user management.
- **Weakness:** enforcement is renderer-side for navigation and IPC-handler-side for
  data. A compromised renderer or a direct IPC call is checked only if each handler
  repeats the check — 145 handlers in one file make that hard to prove. `tests/main/entry-ipc-security.ts` and `entry-messaging-authorization.ts` cover part of it.
- **For NEW:** authorisation must be server-side per endpoint and per row, with a
  generated endpoint × role × tenant matrix (spec Part 16).

## Tenant isolation

- D1 has **no RLS** (SQLite has none). Isolation is code-level `workspace_id` filtering
  added by `0002`, with `company_settings` still a physical singleton and `0003`
  unapplied ("DO NOT APPLY BLIND").
- A test exists: `tests/main/entry-worker-tenant-isolation.ts`, and an API-key cache test
  `entry-worker-api-key-cache.ts`.
- Legacy bridge secret: `MBS_API_KEY` accepted for `mooral-main` only; `MBS_ADMIN_KEY`
  gates workspace provisioning.
- **For NEW:** forced RLS + transaction-local tenant context (spec 6.2) is a hard
  requirement, not an option. Application filters become the second layer.

## Electron hardening

| Control | Evidence | Verdict |
|---|---|---|
| `contextIsolation: true` | `main.ts:4191`, `pdf-engine.ts:128`, `mbs-user/main/index.ts:462` | Good |
| `nodeIntegration: false` | same locations | Good |
| `sandbox: true` | same locations | Good |
| IPC surface | 145 `ipcMain.handle` registrations in `main.ts` | Large; sender validation must be verified at M2 |
| `shell.openExternal` | `main.ts:1652,1684` (`ms-settings:printers`), `license-v2/ipc.ts:164,186` (`wa.me`, `mailto:` built with `encodeURIComponent`) | Constrained, but URLs are constructed from data — allowlist required in NEW |
| `file://` usage | not assessed | Check at M2 |
| Electron fuses | not assessed | Required in NEW (spec 14.3) |
| Electron version | 31 (EOL risk) | Upgrade in NEW only |

## Data protection

- Local database is a plain SQLite file in `userData`; protection depends on OS file
  permissions and disk encryption. No at-rest encryption of business data.
- Licence data **is** encrypted: `license-v2/license/encrypted-license-file.ts` uses
  scrypt with a machine-fingerprint key, plus `trial-storage.ts` anchors.
- Logs: `electron/main/logger.ts` — must be checked for personal data at M2.
- Backups are user-controlled files (`backup-service.ts`) — no encryption verified.

## ASVS 5.0.0 status (chapter level)

The official ASVS CSV has not been ingested into this repository yet, so requirement
identifiers below are chapter-level only; `docs/audit/asvs-5.0-checklist.csv` records
the working matrix and marks the official mapping as pending.

| ASVS chapter | Legacy status | Note |
|---|---|---|
| V2 Authentication | Partial | scrypt + lockout + idle lock; no MFA, no breached-password check |
| V3 Session management | Partial | Hashed token, revocation; no rotation-on-privilege-change evidence |
| V4 Access control | Partial | 77-key catalogue, renderer + IPC checks; no per-row enforcement |
| V5 Validation / encoding | Not assessed | Needs a pass over 145 IPC handlers |
| V7 Error handling / logging | Partial | `audit_log` + `logger.ts`; no structured security events |
| V8 Data protection | Partial | Licence encrypted; business data plain at rest |
| V9 Communication | Partial | HTTPS to the Worker; CORS var present in `wrangler.toml` |
| V11 Business logic | Not assessed | Invoice/ledger logic reviewed only for money type so far |
| V12 Files | Not assessed | Employee photos, logos, backups |
| V13 API | Partial | API-key auth for the Worker; tenant filtering in code |
| V14 Configuration | Partial | Electron flags good; fuses/CSP unverified |

## Findings summary (for the risk register)

1. No MFA anywhere — mandatory in NEW.
2. Tenant isolation is code-level only, with an unapplied migration that blocks a second
   tenant (`company_settings` singleton).
3. 145 IPC handlers in one 110 KB file — authorisation consistency cannot be proven by
   reading.
4. No rate limiting on the Worker's login path (to verify).
5. No breached-password screening.
6. Business data unencrypted at rest locally.
7. Electron 31 is behind current.
8. `react-is` version skew (functional, not security).
