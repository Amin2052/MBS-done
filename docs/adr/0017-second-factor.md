# ADR-0017 — Second factor: TOTP plus one-time recovery codes

- **Status:** Accepted
- **Date:** 2026-11-21
- **Milestone:** M6
- **Supersedes:** the "TOTP/passkeys" placeholder in ADR-0004 for the sign-in path (passkeys
  remain a later addition, see Consequences)
- **Needs review?** No legal review; a penetration test should revisit the threat notes.

## Context

ADR-0004 chose Argon2id passwords and planned a second factor, but M4 only *read*
`platform.users.mfa_enrolled_at`. Owners hold the money and the statutory documents, so a
stolen password is the most valuable single credential in the product. Spec 6.6 requires a
second factor for owner and manager accounts.

Constraints that shaped the decision:

- The product is used by small businesses in Bangladesh; the second factor has to work on a
  basic Android phone, offline, without an email or SMS bill.
- The portal is a static bundle served by the API at one origin (ADR-0016); there is no
  mobile app yet.
- No SMS or email provider is contracted (ADR-0013), so codes sent over those channels are
  not an option this milestone.
- A second factor that can be skipped is not a control: for the privileged roles it must be
  mandatory, not an optional setting.

## Options considered

| Option | Why not (yet) |
|---|---|
| **TOTP (RFC 6238)** | **Chosen.** Offline, free, universally supported by authenticator apps, no vendor, no phone number. |
| SMS one-time codes | Costs money per message, fails without signal, SIM-swap attacks, no provider contracted. |
| Email codes | Same mailbox as the password reset — a stolen mailbox then defeats both factors. |
| Passkeys / WebAuthn | Strongest, but needs a platform authenticator the owner's staff may not have, plus recovery design. Deferred, and additive later. |
| Push notification app | Requires building and publishing an app; out of v1 scope. |

## Decision

1. **TOTP**, SHA-1, 6 digits, 30-second period, 20-byte secret, ±1 step window, replay
   refused by remembering the last accepted step (`packages/domain/src/auth/totp.ts`).
2. **Mandatory for owners and managers.** A password for those roles returns a challenge,
   never a session. An account with no confirmed credential is sent to enrolment instead, so
   there is no "skip for now" state to forget.
3. **Enrolment happens in the sign-in flow**, before the first session exists: the server
   generates the secret, returns it once with an `otpauth://` URI, and only activates the
   factor when the first code is verified. Recovery codes are shown once at that moment.
4. **Ten recovery codes**, 12 characters each from a 30-symbol alphabet without look-alikes
   (≈59 bits each), stored only as sha256 of the dense form, each spendable once. They are
   checked after the TOTP check fails, so the two never compete.
5. **Opaque challenge tokens.** The password step returns a 256-bit token; only its sha256
   is stored (`platform.mfa_challenges`). A challenge expires after five minutes, is spent
   by one success, is replaced by any newer challenge for the same user, and dies after five
   wrong codes.
6. **Secrets are sealed at rest** with AES-256-GCM under `MBS_MFA_KEY`, a 32-byte key that
   lives outside the database. A dump or backup without the key yields no usable TOTP
   secret. A documented development key exists so the demo and tests run unconfigured; the
   API refuses to start with it when `NODE_ENV=production`.
7. **Wrong codes hit the same per-address throttle as passwords** (5 failures / 15 minutes),
   keyed by sha256 of the address, so the second factor cannot be ground down by opening
   challenges repeatedly. The throttle now takes the caller's clock (migration 0004) so one
   rule never compares two clocks.
8. **Tenant binding.** The challenge records the business the password step chose
   (`bound_tenant_id`) and the role is re-proved from a live membership at code time. The
   browser still never names a business after login.
9. **Everything is audited** in the tenant's append-only log: `auth.login` now records
   `strength` (`password` | `totp` | `recovery`), and the first enrolment adds
   `auth.mfa_enroll`.

## Threat notes

- **Phishing a code**: TOTP codes are phishable in real time. That is the known cost of not
  using WebAuthn; it is still a large improvement on a password alone, and passkeys are the
  planned follow-up.
- **Lost phone**: recovery codes, then re-enrolment. There is no self-service reset that
  bypasses the factor; an owner with no codes and no phone needs another owner or support
  (a runbook item for M15).
- **Database leak**: secrets are ciphertext; sessions are hashes; recovery codes are hashes;
  challenge tokens are hashes. The key is the remaining single point of failure and must be
  held with the same care as the database password, separately from the backups.
- **Clock skew**: a phone more than 30 seconds out is rejected; the UI says so in both
  languages rather than silently widening the window.
- **Enrolment takeover**: a pending secret is rotated on every enrolment challenge, so an
  abandoned or observed pending secret cannot be used later.

## Consequences

- `apps/api/src/{mfa,session}.ts`, `packages/domain/src/auth/{totp,recovery,secret-box}.ts`,
  `db/migrations/0003_mfa.sql` and `0004_login_clock.sql`, two new routes, and the second
  step of the sign-in screen (bn/en).
- Deployments must set a real `MBS_MFA_KEY`. Losing it locks every enrolled owner out, so it
  belongs in the secret store and the disaster-recovery runbook.
- Passkeys, a session list with revoke-all, and self-service factor reset remain open; the
  last needs a support runbook before real owners are onboarded.
