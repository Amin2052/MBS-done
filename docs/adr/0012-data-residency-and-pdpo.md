# ADR-0012 — Data residency and personal-data posture

**Status:** Accepted · **Date:** 2026-11-21 · **Class:** D2 ·
**Tag:** `NEEDS-PROFESSIONAL-REVIEW` · **Reversibility:** medium (moving regions later
is a migration, not a config change)

## Context

Spec 10.2 requires a PDPO compliance map and a data-residency ADR, and forbids hardcoding
legal interpretations. Facts as recorded in the prompt's Appendix A: the Personal Data
Protection Ordinance, 2025 (Ordinance No. 61 of 2025) was gazetted in November 2025 and
reported effective 6 November 2025; the Personal Data Protection (Amendment) Ordinance,
2026 (Ordinance No. 23 of 2026, 5 February 2026) narrowed the localisation obligation to
"restricted personal data" and critical information infrastructure; an 18-month transition
and a cloud-first policy were reported. Sources disagree on details, and the prompt says to
confirm on bdlaws.minlaw.gov.bd.

**This ADR does not assert the law. It records the conservative engineering posture.**

## Decision

1. **Deploy in one region:** Singapore, single database cluster, encrypted at rest and in
   transit. Chosen for latency to Bangladesh and mature managed-Postgres availability.
2. **Classify data before moving any of it.** Two classes are defined now:
   - *Restricted candidate*: national identifiers, financial account data, employee
     personal data, customer contact data.
   - *Non-restricted*: product catalogue, chart of accounts, tax rates, templates.
   The classification is reviewed by the professional reviewer before any cross-border
   claim is made.
3. **No cross-border transfer is relied on as lawful without review.** If the review
   concludes restricted data must stay in Bangladesh, the migration path is a
   Bangladesh-region host with the same IaC; nothing in the schema depends on region.
4. **Data-subject rights by design:** export (owner-facing, machine-readable), correction,
   deletion via audited process, and a documented retention schedule.
5. **Consent and notice:** privacy notice shown at registration; employee data processed
   under the business owner's instruction (the business is the controller, MBS the
   processor) — recorded in the terms, not just in code.
6. **Breach notification:** a runbook exists at M15 with a 72-hour decision point, marked
   as needing legal confirmation.
7. **Retention defaults** (all configurable, all tagged for review): invoices and ledger
   entries 7 years; audit log 2 years; session records 90 days; deleted-tenant data
   purged 90 days after cancellation.

## Consequences

- Nothing in the schema, API or storage layer may assume a specific country, except the
  locale defaults (BDT, Asia/Dhaka).
- Backup copies inherit the same residency decision; cross-region backup replication is
  **off** until the review says otherwise.
- The compliance map is a living document and is re-checked whenever the law changes.

## Sources

- Prompt Appendix A (2026-11-20): PDPO facts, Amendment Ordinance 2026, National Data
  Governance Ordinance 2025
- To be confirmed by the reviewer: bdlaws.minlaw.gov.bd (official text), NBR guidance
