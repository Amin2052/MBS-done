# ADR-0011 — v1 module scope

**Status:** Accepted · **Date:** 2026-11-21 · **Class:** D1 (owner may override) ·
**Reversibility:** high (scope can be widened; nothing here blocks later work)

## Context

The audit produced three facts that change the plan (`module-parity-matrix.md`):

1. **Suppliers, Purchases and Expenses do not exist in the legacy product** — no screens,
   repositories or tables — yet the master prompt lists them under Owner modules and
   parity.
2. **Five real modules are absent from the prompt's list**: certificates, messages,
   backup/restore, licence/activation, audit log.
3. The legacy UI ships **three** locales (bn, ar, en); the prompt names two.

The prompt was followed as written where it is unambiguous. Where it assumed a feature
exists that does not, the decision below follows its own acceptance criterion ("legacy
functionality is preserved or migrated with verified equivalence") rather than inventing
new requirements, because inventing them would delay the migration and has no parity
justification.

## Decisions

| Module | Decision | Rationale |
|---|---|---|
| **Suppliers / Purchases / Expenses** | **Not in v1.** Designed for, not built. Schema leaves room (`parties` table can gain `kind='supplier'`), and they are recorded as post-v1 extensions. | They are new features, not parity. Building them would consume M7 capacity needed for real parity work. |
| **Certificates** | **In v1** (M7). | Real, used business feature; dropping it is a visible regression. |
| **Messages / notifications** | **In v1** (M7), simplified to notifications + per-record comments. | Real usage; the realtime chat variant is not required. |
| **Backup / restore** | **Replaced** by per-tenant data export (owner-facing) plus platform-level backup and a support-assisted restore. | The SaaS owns backups; a customer-facing restore of the whole database is unsafe multi-tenant. Export satisfies portability. |
| **Licence / activation** | **Not ported.** Subscription entitlements replace it (M13). Legacy app keeps its own activation. | Activation is a desktop-commercial mechanism; the SaaS has accounts and plans. |
| **Audit log UI** | **In v1** as an owner-visible activity log (M5). | Cheap, and it is a trust feature. |
| **Arabic locale** | **Not shipped in v1.** Catalogs remain bn + en. | Not in the prompt's language requirement; each extra locale is maintenance and QA cost. Source strings stay in OLD if ever needed. |
| **Payroll** | Settings only, as today. | Legacy has only `salary`/`payroll_overtime_rate` configuration, no payroll run. |

## Consequences

- The parity matrix now distinguishes "**migrate**" (exists in OLD) from "**new**"
  (prompt-only). Only the first is a regression risk.
- `requirements.csv` R-028 is answered by this ADR: the prompt's module list is not a
  requirement to invent modules.
- If the owner wants suppliers/purchases/expenses in v1, add them as a milestone rather
  than squeezing them into M7.

## Follow-up

Post-v1 candidates, in the order they would add the most value for the same effort:
suppliers → purchases (stock-in) → expenses (already partly represented by accounting
            transactions).
