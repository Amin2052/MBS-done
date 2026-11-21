/**
 * The owner portal's routing (ADR-0018). A screen is a URL, not a piece of component
 * state: `/` is the dashboard, `/profile` is the business profile, and anything else is
 * the not-found screen. The API already answers extension-less deep links with
 * `index.html`, so a refresh or a pasted link lands on the same screen.
 *
 * Deliberately tiny: no dependency, no nested layout routes, no data loading here. A
 * router earns its keep only when the screen is the thing a link, a refresh and the back
 * button all have to agree on.
 */
import { useCallback, useEffect, useState } from "react";

export const ROUTES = {
  dashboard: "/",
  profile: "/profile",
} as const;

export type RouteId = keyof typeof ROUTES;

export interface ResolvedRoute {
  id: RouteId | "notFound";
  /** The normalised path, suitable for the active-navigation check. */
  path: string;
}

/** `/profile/` and `/profile` are the same screen; `/` stays `/`. */
export function normalisePath(pathname: string): string {
  if (!pathname || pathname === "/") return "/";
  const withoutTrailingSlashes = pathname.replace(/\/+$/, "");
  return withoutTrailingSlashes === "" ? "/" : withoutTrailingSlashes;
}

export function resolveRoute(pathname: string): ResolvedRoute {
  const path = normalisePath(pathname);
  if (path === ROUTES.dashboard) return { id: "dashboard", path };
  if (path === ROUTES.profile) return { id: "profile", path };
  return { id: "notFound", path };
}

/** The few click facts that decide whether the app may take over a link. */
export interface ClickLike {
  button: number;
  metaKey: boolean;
  ctrlKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
  defaultPrevented: boolean;
}

/**
 * A plain left click on a same-origin http(s) link becomes an in-app navigation. A new
 * tab, a modifier key, a download or an external destination keeps the browser's own
 * behaviour — including `javascript:` and `data:` links, which are never intercepted.
 */
export function shouldNavigate(event: ClickLike, href: string, origin: string): boolean {
  if (event.defaultPrevented) return false;
  if (event.button !== 0) return false;
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return false;

  let target: URL;
  try {
    target = new URL(href, origin);
  } catch {
    return false;
  }
  if (target.origin !== origin) return false;
  if (target.protocol !== "http:" && target.protocol !== "https:") return false;
  return target.pathname.startsWith("/");
}

export interface Router {
  path: string;
  navigate(path: string, options?: { replace?: boolean }): void;
}

/** The live path plus a `navigate` that keeps history and the screen in step. */
export function useRouter(): Router {
  const [path, setPath] = useState(() => normalisePath(window.location.pathname));

  useEffect(() => {
    const onPopState = () => setPath(normalisePath(window.location.pathname));
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  const navigate = useCallback((next: string, options: { replace?: boolean } = {}) => {
    const target = normalisePath(next);
    const current = normalisePath(window.location.pathname);
    if (target === current) {
      setPath(target);
      return;
    }
    if (options.replace) window.history.replaceState(null, "", target);
    else window.history.pushState(null, "", target);
    setPath(target);
    window.scrollTo({ top: 0 });
  }, []);

  return { path, navigate };
}
