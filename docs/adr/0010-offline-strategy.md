# ADR-0010 — Offline behaviour and legacy desktop coexistence

**Status:** Accepted · **Date:** 2026-11-21 · **Class:** D1 · **Reversibility:** medium
(an offline-capable design can be added later without changing the online model)

## Context

The audit (`offline-dependence-report.md`) found that offline is the **default operating
mode** of the legacy product: a local SQLite database is the primary store, backup/restore
is a first-class feature, and the cloud sync layer is an addition. Spec 3.3 requires the
web v1 to be online-only **and** the legacy desktop to stay supported for offline-dependent
businesses until an offline design is approved by an ADR.

## Options considered

| Option | Assessment |
|---|---|
| Offline writes in v1 (CRDT or queue-and-sync) | Weeks of work, conflict semantics across invoices/ledger, and a second source of truth — the exact risk the spec forbids for v1. |
| Online-only, replace desktop immediately | Cheapest to build, but breaks customers whose internet is unreliable; violates the spec's migration promise. |
| **Online-only web v1 + keep the legacy desktop for offline businesses + explicit per-business acceptance** | Matches the spec, keeps the promise, and defers the hard problem with a written record of who is affected. |

## Decision

1. Web v1 is **online-only**. The service worker caches only the application shell — never
   API responses or personal data (spec 14.1).
2. The legacy Electron app keeps running, unchanged, for any business that needs offline
   writes. It is not modified, only supported.
3. A business that depends on offline writes is **not cut over** until it accepts an
   online-only workflow in writing, or an offline design is approved.
4. The offline question is recorded as risk **R1** (top risk) with a per-business
   questionnaire in the cutover runbook: hours offline per day, whether sales are entered
   during outages, number of devices per business.
5. If an offline design is later approved, it will be a local-first client with an explicit
   sync protocol and conflict rules for money documents (never last-write-wins for
   invoices or ledger entries).

## Consequences

- No offline write complexity in v1; the API can assume connectivity.
- Two products coexist during migration; support must know which one a business is on.
- The desktop app's data must remain exportable, which is also a PDPO portability
  advantage.
