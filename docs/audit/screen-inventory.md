# Screen inventory — OLD @ `c2871d2`

Every screen below is a file under `src/pages` or `src/components`, reached through
`src/router/routes.tsx` (hash router) or rendered directly. Access gates are
`RequireModuleAccess module="…"` and `RequireBusinessMode requires="enterprise"`.

## Owner desktop — 14 module routes

| Route | Component | Lines | Module gate | Notes |
|---|---|---|---|---|
| `/` | `dashboard-page.tsx` | 766 | `dashboard` | Widgets incl. `dashboard/messages-card` |
| `/customers` | `customers-page.tsx` | 987 | `customers` | List + form in one file |
| `/products` | `products-page.tsx` | 1,363 | `products` | |
| `/product-details` | `product-details-page.tsx` | — | `products` | Detail/form |
| `/inventory` | `inventory-page.tsx` | 1,220 | `products` | Gated by the **products** module, not `inventory` |
| `/orders` | `orders-page.tsx` | 669 | `orders` | |
| `/invoices` | `invoices-page.tsx` | 3,119 | `invoices` | Largest screen in the product |
| `/accounting` | `accounting-page.tsx` | 2,028 | `accounting` | Tabs: `account-summary-view`, `journal-view` (324), `ledger-view` (277) |
| `/reports` | `reports-page.tsx` | 1,735 | `reports` | Lazy-loaded |
| `/certificates` | `certificates-page.tsx` | 1,614 | `certificates` | Not named in the master prompt's module list |
| `/employees` | `employees-page.tsx` | 1,555 | `employees` | |
| `/profile` | `profile-page.tsx` | 552 | none | Always reachable |
| `/change-password` | `change-password-page.tsx` | 264 | none | Always reachable |
| `/settings` | `settings-shell.tsx` | — | `settings` | Shell with category nav |

## Owner desktop — 16 settings screens

`company-profile` (475), `financial-invoice`, `certificate-settings`,
`localization`, `user-management` (1,730, **enterprise mode only**),
`finance-accounting`, `inventory-settings`, `sales-purchase`, `hr-payroll`,
`security-settings` (286), `notifications`, `integrations` (505),
`document-templates`, `database-settings` (556), `license-settings`, `about` (266),
plus `settings-coming-soon.tsx` as a placeholder.

## Authentication and licence screens

| Screen | File | Lines | Notes |
|---|---|---|---|
| Login | `components/auth/login-screen.tsx` | 310 | Username + password, Remember Me |
| Forgot password | `components/auth/forgot-password-screen.tsx` | 558 | Recovery-key flow |
| Licence gate | `components/license/license-gate.tsx` | 420 | Blocks the app before activation |
| Change password | `pages/change-password-page.tsx` | 264 | |

## Overlays and shared UI

`print-preview/print-preview-modal.tsx` (892 lines) is the single largest component and
is the print/PDF surface for invoices, certificates and reports.

## Employee app (`mbs-user`) — 1 screen

`mbs-user/renderer/App.tsx` is a **754-line single-file SPA** with a `ViewKey` state
machine, a collection loader (`useCollection`), a generic `DataTable`, a connection
indicator, employee login (id + password), a server-configuration panel that is locked
until unlocked, and order-approval actions. There is no router and no per-feature
component split.

## Mapping to the three NEW portals

| Legacy screen group | NEW portal | Milestone |
|---|---|---|
| Dashboard, Customers, Products, Inventory, Orders, Invoices, Accounting, Reports, Certificates, Settings | Owner portal | M5–M8 |
| Employees, user management, permission profiles | Owner portal | M5 |
| Employee app | Employee portal | M9 |
| Licence gate, license settings, database settings, backup/restore, ERP reset | **No NEW equivalent** — platform/release concerns | M5/M15 (decide) |

## Gaps worth flagging

- **No suppliers, purchases or expenses screens exist**, although the master prompt's
  module list (Part 7A) names all three. See `module-parity-matrix.md`.
- Inventory is gated by the `products` module, so a permission profile that grants
  `inventory.view` alone cannot reach the inventory screen.
- Five screens are **not** in the prompt's list but exist and carry real logic:
  certificates, licence, database settings, ERP reset panel, messages card.
