# ADR-0003 — Money representation and rounding

**Status:** Accepted · **Date:** 2026-11-21 · **Class:** D1 (with a D2 rounding tag) ·
**Reversibility:** low once data exists

## Context

The audit found money stored as `REAL` throughout the legacy D1 schema
(`price`, `total`, `subtotal`, `discount`, `tax`, `paid`, `due`, `amount`, `debit`,
`credit`, `running_balance`, `salary`, `tax_rate`, and `payroll_overtime_rate`), repeated
even when `0003` recreates those tables. Floating point cannot represent 0.10 exactly, so
legacy totals can already be off by small amounts, and the existing data may encode those
errors in balances.

Spec 11.2 requires: `NUMERIC(19,4)`, decimal strings on the wire, a decimal library in
code, server-computed totals, and classification of every legacy-vs-new difference of
≥ ৳0.01 as `legacy-bug`, `intended-change` or `regression`.

## Options considered

| Option | Assessment |
|---|---|
| Integer minor units (paisa) | Exact, but BDT invoices carry 4 decimal places in tax computations and the legacy data uses fractions; converting everything to integers hides rounding decisions rather than making them explicit. |
| `NUMERIC(19,4)` + decimal library | Matches the spec, exact, and preserves the legacy 4-decimal capacity. |
| `double precision` | Reintroduces the exact defect being fixed. |

## Decision

- Storage: `NUMERIC(19,4)` for every amount and rate.
- Transport: JSON strings (`"1234.5000"`), never JSON numbers.
- Code: `decimal.js` in `packages/domain`; comparisons via `.equals`/`.cmp`, never `==`.
- Rounding: **half-up to 2 decimals for BDT presentation**, full precision retained in
  storage; tax computed per line then summed, with the rule recorded per business.
- The server computes every total, tax, discount and balance; clients only display.
- Every ETL money column is compared legacy-vs-new and any difference ≥ ৳0.01 is
  classified and reported.

## Consequences

- All aggregation queries must cast/format explicitly; no `avg()` over money.
- Reports and PDFs format from the decimal string, not from a JS number.
- The rounding rule itself is `NEEDS-PROFESSIONAL-REVIEW` (D2): half-up is the
  conservative default, but the VAT-correct treatment for Mushak invoices must be
  confirmed with a Bangladeshi tax professional.

## Reversibility

Low after data exists: changing storage or rounding later requires a full reconciliation
pass over every financial record.

## Sources

- https://www.postgresql.org/docs/18/datatype-numeric.html (checked 2026-11-21)
- https://mikemcl.github.io/decimal.js/ (checked 2026-11-21)
