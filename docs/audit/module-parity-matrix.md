# Module parity matrix — OLD @ `c2871d2`

One row per module from the master prompt Part 11.1, plus every module that actually
exists in OLD. "Legacy evidence" is the file or table that proves the behaviour exists.

Legend: **Y** exists · **P** partial · **N** absent · **?** not yet verified

| Module | Screen | Repositories / services | D1 tables | Tests | Status |
|---|---|---|---|---|---|
| Dashboard | `dashboard-page.tsx` | report-service | — (derived) | — | Y |
| Customers | `customers-page.tsx` | `customer-repository.ts` (127) | `customers` | — | Y |
| Products | `products-page.tsx`, `product-details-page.tsx` | `product-repository.ts` (179) | `products` | — | Y |
| Inventory | `inventory-page.tsx` (gated by **products**) | `inventory-repository.ts` (218) | `inventory_transactions` | — | Y |
| Orders | `orders-page.tsx` | `order-repository.ts` (743) | `orders` | `entry-order-invoice.ts` | Y |
| Invoices | `invoices-page.tsx` (3,119) | `invoice-repository.ts` (1,484) | `invoices` | `entry-order-invoice.ts` | Y |
| Payments | inside invoices/orders | (part of `transactions`) | `transactions` | — | P |
| Accounting | `accounting-page.tsx` + 3 views | `accounting-repository.ts` (586), `ledger-repository.ts` (935) | `accounts`, `journal_entries`, `ledger_entries` | — | Y |
| Reports | `reports-page.tsx` | `report-service.ts` | — | — | Y |
| Certificates | `certificates-page.tsx` | `certificate-repository.ts` (584) | `certificates` | — | Y (not in prompt list) |
| Employees | `employees-page.tsx` | `employee-repository.ts` (503), `employee-contract-repository.ts` (272) | `employees`, `employee_contracts` | — | Y |
| Payroll | settings only (`hr-payroll`) | — | `employee_contracts.salary`, `payroll_overtime_rate` | — | P |
| Company settings | `settings/company-profile.tsx` | `company-settings-service.ts` | `company_settings` (singleton) | — | Y |
| Printing / PDF | `print-preview-modal.tsx` (892) | `pdf-engine.ts`, `pdf/pdf-html.ts` | — | — | Y |
| Messages / notifications | `dashboard/messages-card.tsx` | `message-repository.ts`, `notification-repository.ts`, `messaging-manager.ts`, `realtime-messaging-service.ts` | `mbs_messages`, `notifications` | `entry-messaging-authorization` | Y (not in prompt list) |
| Users / permissions | `settings/user-management.tsx` (1,730) | `user-repository.ts`, `permission-profile-repository.ts`, `session-repository.ts` | `users`, `sessions`, `permissions`, `permission_profiles`, `user_permissions`, `profile_permissions` | `entry-ipc-security` | Y |
| Audit log | — (no screen) | `audit-log-repository.ts` | `audit_log` | — | Y |
| Backup / restore | `settings/database-settings.tsx` | `backup-service.ts`, `data-transfer-service.ts` | — | `entry-backup-restore` | Y (not in prompt list) |
| Cloud sync | — | `cloud-sync-manager.ts`, `cloud-sync-repository.ts` | `0004`–`0006` | `entry-bidirectional-sync`, `entry-cloud-multiuser`, `entry-cloud-reset` | Y |
| Licence / activation | `license-gate.tsx`, `settings/license-settings.tsx` | `license-v2/*` (own crypto + storage) | — | `entry-license-mode-switch`, `entry-license-verification` | Y (not in prompt list) |
| Employee app | `mbs-user/renderer/App.tsx` (754) | `mbs-user/shared/api-client.ts` | via Worker | `entry-mbs-user` | Y |
| **Suppliers** | **N** | **N** | **N** (no table) | **N** | **N** |
| **Purchases** | **N** | **N** | **N** | **N** | **N** |
| **Expenses** | **N** | **N** (accounting only) | **N** | **N** | **N** |

## The three gaps that change the plan

1. **Suppliers, Purchases and Expenses do not exist in OLD.** The master prompt lists
   them under Owner modules (Part 7A) and parity (11.1). They are therefore *new
   features*, not migrations — they need their own requirements, schema, and an owner
   decision on whether they ship in v1. Recorded as a D1 scope decision and an open
   question, not silently built.
2. **Payments have no separate screen.** They live inside invoices/orders and the
   `transactions` table. NEW can either keep that or add a payments module; the
   matrix marks it `P`.
3. **Five legacy modules are absent from the prompt:** certificates, messages,
   backup/restore, licence/activation and audit-log UI. Dropping any of them silently
   would be a parity regression, so each needs an explicit keep/drop decision.

## Parity checklist template (per module, M6 onward)

- [ ] Every legacy field present in the NEW form or list
- [ ] Every legacy computed total reproduced exactly (server-side)
- [ ] Permission keys mapped from `permission-catalog.ts`
- [ ] Empty / loading / error / permission-denied states implemented
- [ ] Legacy-vs-NEW comparison test with real shapes
- [ ] Differences classified `legacy-bug` / `intended-change` / `regression`
