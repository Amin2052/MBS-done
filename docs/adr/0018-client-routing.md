# ADR-0018 — Client routing and navigation for the owner portal

- **Status:** Accepted
- **Date:** 2026-11-22
- **Milestone:** M7
- **Supersedes:** the “No router yet” clause of ADR-0016
- **Class:** D1 · **Reversibility:** high (one module, one table)

## Context

ADR-0016 deliberately shipped the portal without a router because there were two screens
and the session itself was the route: signed out → sign-in, signed in → profile. The
third screen (the dashboard) makes a URL necessary: a refresh, a pasted link, a bookmark
and the back button all have to land on the same screen.

The constraints are the same ones that chose the client stack:

- one static bundle served by the API at the same origin (ADR-0016);
- no second server, no CORS allow-list, no token in JavaScript;
- a small number of authenticated, permission-gated screens, not a public content site;
- the server stays the only authority on what a user may see (spec 6.1, 7);
- no screen may appear as “available” just because the legacy desktop app had it.

`apps/api/src/static.ts` already answers unknown extension-less paths with `index.html`
and refuses traversal, so deep links reach the bundle. What was missing was a client-side
mapping from the address to a screen.

## Options considered

| Option | Assessment |
|---|---|
| **`react-router`** | Mature and familiar; nested layouts, loaders and lazy routes are useful for a large app. Adds a dependency and a data-loading model that duplicates the API client; the portal has no nested layouts yet. |
| Hash routing (`#/profile`) | Trivial and needs no server support; ugly to share, breaks “copy the address”, and pretends the URL is not a real one. |
| File-based router (framework) | Would mean adopting Next/Remix and a second runtime (rejected in ADR-0016). |
| **Dependency-free History API router** | ~90 lines, one table, `<a href>` links, `popstate`, explicit not-found. No new dependency, no build step, no hidden data loading. |

## Decision

1. **One fixed route table** in `apps/web/src/lib/router.ts`: `/` is the dashboard,
   `/profile` is the business profile. Anything else is the not-found screen rendered
   inside the shell — not a blank page and not a redirect that hides a typo.
2. **Paths are normalised, never case-folded.** `/profile/` and `/profile` are the same
   screen; `/Profile` is not found. A case-insensitive filesystem must not become a
   case-insensitive URL space.
3. **Links are real anchors.** Navigation uses `<a href>` so middle-click, ⌘/Ctrl-click,
   “open in new tab” and “copy link address” work. A plain left click on a same-origin
   http(s) link is taken over (`preventDefault` + `pushState`); modifier keys, other
   buttons, external hosts, `javascript:` and `data:` are left to the browser. The check
   is a pure function with its own tests.
4. **The back/forward button is the router’s other half.** `popstate` re-reads
   `location.pathname`; there is no cache of the previous screen to fall out of sync.
5. **The navigation lists only screens that exist and pass tests** (`lib/nav.ts`). It is
   not a promise list: a legacy module appears when its route, screen, permissions and
   tests exist. The current entries are Dashboard and Business profile.
6. **Navigation is presentation, never authorization.** Hiding or showing an item grants
   nothing; every API route re-checks the session, the business and the role. A
   permission-driven menu is added when the permission catalogue exists (M4/M5), not
   ahead of it.
7. **No code splitting, no nested routes, no route loader yet.** The bundle is already
   ~90 KiB gzip and all screens are behind the same session; a dynamic import buys
   nothing at this size. A route loader would duplicate the screen’s own loading, empty
   and error states.
8. **The dashboard shows only facts that exist.** Its data comes from one authenticated
   endpoint, `GET /api/v1/dashboard`, scoped by RLS and an explicit `tenant_id`
   predicate. Sales, stock and money widgets wait for the modules that produce them;
   inventing sample data would violate spec 7A.

## Consequences

- `apps/web/src/lib/router.ts` and `lib/nav.ts`; `App.tsx` renders shell + screen by
  route; `AppShell.tsx` owns the sidebar and active state.
- Deep links keep working through the existing SPA fallback; no server change was needed
  for routing.
- Adding a screen is a route entry, a nav entry (if it belongs in the menu) and a
  component — deliberately three visible edits rather than convention-over-configuration.
- If the portal grows nested layouts or public pages, `react-router` can replace the hook
  without changing screen props; the server contract is unaffected.
- The not-found screen is now a user-visible state and must stay translated (it is).

## Sources

- https://developer.mozilla.org/en-US/docs/Web/API/History_API (checked 2026-11-22)
- https://developer.mozilla.org/en-US/docs/Web/API/Window/popstate_event (checked 2026-11-22)
- https://react.dev/reference/react/useSyncExternalStore (considered for the hook; a
  `useState` + `popstate` pair is enough for one listener)
