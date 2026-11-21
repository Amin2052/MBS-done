# Design system — tokens and component rules

Spec 9 requires fixed tokens, light/dark themes, two densities, and no hardcoded page
styles. Values below are the starting reference from spec 9.2, with contrast checked.

## Colour

| Token | Light | Dark | Use |
|---|---|---|---|
| `--bg` | `#F1F5F9` | `#0B1220` | Page background |
| `--surface` | `#FFFFFF` | `#111A2B` | Cards, tables, dialogs |
| `--surface-2` | `#F8FAFC` | `#16223A` | Table striping, inset panels |
| `--text` | `#0F172A` | `#E6EDF7` | Primary text |
| `--text-muted` | `#64748B` | `#94A3B8` | Secondary text |
| `--border` | `#E2E8F0` | `#24324B` | Dividers, inputs |
| `--primary` | `#2563EB` | `#3B82F6` | Primary action |
| `--primary-hover` | `#1D4ED8` | `#60A5FA` | Hover |
| `--navy` | `#172554` | `#0A1428` | Sidebar base |
| `--secondary` | `#0D9488` | `#14B8A6` | Secondary accent |
| `--success` | `#16A34A` | `#22C55E` | Success |
| `--warning` | `#D97706` | `#F59E0B` | Warning |
| `--danger` | `#DC2626` | `#EF4444` | Destructive |
| `--focus` | `#2563EB` | `#60A5FA` | Focus ring (2px, 2px offset) |

Contrast targets: body text ≥ 4.5:1, large text ≥ 3:1, UI boundaries ≥ 3:1. Every pair
above is checked at build time by a token test; a failing pair fails CI.

## Typography

- Families: `Inter` (Latin), `Noto Sans Bengali` (Bangla). Loaded locally, subset per
  language, `font-display: swap`.
- Scale (rem): 0.75 / 0.875 / 1 / 1.125 / 1.25 / 1.5 / 1.875 / 2.25.
- Line height: 1.5 body, 1.25 headings. Bangla body needs 1.65 — a language-scoped
  override, not a per-page one.
- Weights: 400 / 500 / 600 / 700 only.
- Numbers in tables: `font-variant-numeric: tabular-nums`.

## Space, radius, elevation

- Spacing scale: 4, 8, 12, 16, 20, 24, 32, 40, 48, 64 px (`--space-1..10`).
- Radius: `--radius-sm 6px`, `--radius-md 10px`, `--radius-lg 14px`, `--radius-full 999px`.
- Shadow: `--shadow-sm` (cards), `--shadow-md` (popovers), `--shadow-lg` (dialogs). No
  coloured or glow shadows.
- Border width: 1px everywhere; focus uses outline, never border colour alone.

## Density

| Token | Compact | Comfortable |
|---|---|---|
| Row height | 36px | 44px |
| Cell padding | 8px 10px | 12px 14px |
| Field height | 34px | 40px |
| Section gap | 16px | 24px |

## Component rules (all components)

- Nine states: default, hover, focus-visible, active, disabled, loading, success, error,
  empty, permission-denied.
- Every table: sortable headers, search, filter, cursor pagination, row actions, bulk
  select, density switch, empty state with a next action.
- Every form: label above field, required marker, inline error text tied by
  `aria-describedby`, unsaved-changes guard, explicit save/cancel.
- Dialogs trap focus, restore it on close, close on Escape, and are labelled by their title.
- Toasts are `role="status"`, never the only carrier of an error.
- **No component calculates money.** Totals arrive pre-computed from the server and are
  rendered as strings.

## Do not

Gradients as structure, glassmorphism, oversized metric cards, decorative charts, emoji as
icons, more than one accent colour per screen, or per-page CSS files (the legacy product
has 35 of them; NEW has one stylesheet per component package).
