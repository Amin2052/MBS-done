# Component inventory — OLD @ `c2871d2`

## Where UI lives

| Location | Files | Role |
|---|---|---|
| `src/components/<domain>/` | 9 groups | Shared components |
| `src/pages/**` | 30 pages + 35 CSS files | Screens, each with a sibling stylesheet |
| `src/layouts/app-layout.tsx` | 1 | Shell (sidebar + topbar + outlet) |
| `src/styles/` | global CSS | Base tokens |
| `tailwind.config.ts`, `postcss.config.js` | — | Tailwind 4 pipeline |

## Component groups

| Group | Contents | Notes |
|---|---|---|
| `layout` | `topbar.tsx` (761 lines), sidebar/`app-layout` | Topbar alone is as large as a mid-size page — candidate for splitting in NEW |
| `auth` | `login-screen.tsx` (310), `forgot-password-screen.tsx` (558) | Full screens, not primitives |
| `dashboard` | widget cards incl. `messages-card.tsx` (437) | Widget catalogue exists implicitly |
| `print-preview` | `print-preview-modal.tsx` (892) | Single print/PDF surface — reuse the *idea*, not the code |
| `license` | `license-gate.tsx` (420) | Activation UI |
| `settings` | `erp-reset-panel.tsx` (349) | Danger-zone style panel |
| `confirm` | confirmation dialog | |
| `error` | error boundary / state | |
| `toast` | notifications | |

## Primitive-level observations

There is **no design-system package**: buttons, inputs, tables, modals, badges and
empty states are re-implemented per page. Evidence: 35 CSS files for 30 pages, e.g.
`customers.css`, `invoices.css`, `products.css` each restating layout and spacing.

`DataTable` exists only inside `mbs-user/renderer/App.tsx` (employee app), so the owner
portal has no shared table component even though every module is a table.

## Reuse decision for NEW

Per spec Part 9 and 5.10, NEW builds one component library in `packages/ui`. What can be
copied from OLD (recorded in `ORIGINS.md` when copied):

| Copy candidate | Why |
|---|---|
| Permission *catalogue* (`src/auth/permission-catalog.ts`) | 11 modules × 7 actions = 77 keys, already a single source of truth |
| Permission *engine* (`src/auth/permission-engine.ts`) | Owner bypass + per-module checks; adapt into server-side enforcement |
| Print/PDF templates (`src/pdf/templates`, `src/pdf/pdf-html.ts`) | Real document shapes; must be re-checked for Bangla shaping |
| i18n message trees (`src/i18n/{en,bn,ar}.ts`) | 1,489 / 1,481 / 1,481 lines of real business wording |

Do **not** copy: page-level CSS, the 3,119-line invoices page, the 2,028-line accounting
page, or the 754-line employee `App.tsx`. They are being replaced by the NEW shells.
