# ADR-0013 — Email and SMS delivery

**Status:** **Proposed** (decision deferred to a delivery spike) · **Date:** 2026-11-21
· **Class:** D1 · **Reversibility:** high (one sender interface, three call sites)

## Context

Needed for: email verification, password reset, MFA enrolment notices, invitation to
employees, subscription receipts, and security alerts. SMS only if OTP over SMS is ever
offered — and spec 6.6 forbids SMS as the *only* second factor.

The legacy product sends nothing (offline desktop, owner recovery key). So there is no
inherited provider and no deliverability history.

## Options considered

| Channel | Options | Notes |
|---|---|---|
| Email | Amazon SES, Resend, Postmark, Mailgun | SES is cheapest at volume but needs a warmed domain and region setup; Resend/Postmark are simpler with better default deliverability. |
| SMS (Bangladesh) | Local aggregators (e.g. SSL Wireless, Bulk SMS BD), Twilio | Local aggregators have better BD termination rates and sender-ID rules; Twilio is simpler but expensive per message to BD. Contracts/KYC are the owner's (HUMAN-REQUIRED). |

## Decision (proposed)

- One `Mailer` and one `Sms` interface in `packages/domain`; providers are adapters.
- **Email:** start with a transactional provider that supports DKIM/SPF/DMARC setup and a
  sandbox for tests; the specific vendor is chosen by the spike that measures delivery
  to Gmail/Outlook/Yahoo in Bangladesh. Until then, the adapter is a no-op that records
  the intent in the job table in development.
- **SMS:** not used in v1. If added, a local Bangladeshi aggregator, never as the only
  factor.
- All sends go through the job queue (ADR-0007), never inline in a request.
- Templates are localised (bn/en) and rendered from the same i18n catalogs (ADR-0008).
- Bounce/complaint webhooks update a suppression list before the next send.

## Why not decide the vendor now

Provider choice without a delivery test is a guess, and the prompt explicitly requires a
real test message and deliverability measurement before committing. The interface above
means the vendor choice is a one-file change.

## Open items

- Domain reputation setup (SPF, DKIM, DMARC) — needs DNS control, owner action.
- Sender address and reply-to for Bangladesh customers.

## Sources

- https://docs.aws.amazon.com/ses/latest/dg/Welcome.html (checked 2026-11-21)
- https://resend.com/docs (checked 2026-11-21)
- https://postmarkapp.com/why (checked 2026-11-21)
