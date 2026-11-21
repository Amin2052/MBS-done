/**
 * The owner portal's shell: the business, the way around it, and the way out. Screens
 * render inside it, so no screen repeats the header or the navigation.
 *
 * The navigation list is the set of screens that exist and pass tests (spec 7), not the
 * set of modules the legacy product had. Links are real `<a href>` elements so a new tab,
 * a copied address and the back button all work; a plain click is taken over so the app
 * does not reload.
 */
import type { MouseEvent, ReactNode } from "react";
import type { Locale } from "../../../../packages/config/i18n/core.ts";
import type { Me } from "../lib/api.ts";
import type { Translate } from "../lib/messages.ts";
import { NAV_ITEMS, type NavIconName } from "../lib/nav.ts";
import { shouldNavigate } from "../lib/router.ts";

function NavIcon({ name }: { name: NavIconName }) {
  if (name === "grid") {
    return (
      <svg className="nav-icon" viewBox="0 0 20 20" aria-hidden="true" focusable="false">
        <path d="M3 3h6v6H3zM11 3h6v6h-6zM3 11h6v6H3zM11 11h6v6h-6z" />
      </svg>
    );
  }
  return (
    <svg className="nav-icon" viewBox="0 0 20 20" aria-hidden="true" focusable="false">
      <path d="M4 17V7l6-4 6 4v10h-4v-5H8v5z" />
    </svg>
  );
}

export interface AppShellProps {
  me: Me;
  t: Translate;
  locale: Locale;
  onLocaleChange(locale: Locale): void;
  onSignOut(): void;
  /** The resolved path, so the active destination is announced, not just coloured. */
  path: string;
  onNavigate(path: string): void;
  children: ReactNode;
}

export function AppShell({
  me,
  t,
  locale,
  onLocaleChange,
  onSignOut,
  path,
  onNavigate,
  children,
}: AppShellProps) {
  function follow(event: MouseEvent<HTMLAnchorElement>, href: string) {
    if (!shouldNavigate(event, href, window.location.origin)) return;
    event.preventDefault();
    onNavigate(href);
  }

  return (
    <div className="app">
      <header className="topbar">
        <div className="topbar-brand">
          <span className="brand-mark" aria-hidden="true">
            M
          </span>
          <div className="brand-text">
            <p className="brand-name">{t("app.name")}</p>
            <p className="brand-business">{me.tenant.name}</p>
          </div>
        </div>

        <div className="topbar-actions">
          <label className="locale-control">
            <span className="visually-hidden">{t("locale.label")}</span>
            <select
              className="select select-compact"
              value={locale}
              onChange={(event) => onLocaleChange(event.target.value as Locale)}
            >
              <option value="bn">{t("locale.bn")}</option>
              <option value="en">{t("locale.en")}</option>
            </select>
          </label>

          <p className="signed-in">
            <span>{t("common.signedInAs", { email: me.user.email })}</span>
            <span className="role-chip">{t(`role.${me.role}`)}</span>
          </p>

          <button type="button" className="btn btn-ghost" onClick={onSignOut}>
            {t("auth.signOut")}
          </button>
        </div>
      </header>

      <div className="app-body">
        <nav className="sidebar" aria-label={t("nav.main")}>
          <ul className="nav-list">
            {NAV_ITEMS.map((item) => {
              const active = item.path === path;
              return (
                <li key={item.id}>
                  <a
                    className={`nav-link${active ? " nav-link-active" : ""}`}
                    href={item.path}
                    aria-current={active ? "page" : undefined}
                    onClick={(event) => follow(event, item.path)}
                  >
                    <NavIcon name={item.icon} />
                    <span>{t(item.labelKey)}</span>
                  </a>
                </li>
              );
            })}
          </ul>
        </nav>

        <main className="page">{children}</main>
      </div>

      <footer className="page-footer">
        <p className="muted">{t("app.tagline")}</p>
      </footer>
    </div>
  );
}
