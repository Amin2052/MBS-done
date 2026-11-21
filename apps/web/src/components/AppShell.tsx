/**
 * The owner portal's shell: language, who is signed in, and the way out. Screens render
 * inside it, so no screen ever repeats the header.
 */
import type { ReactNode } from "react";
import type { Locale } from "../../../../packages/config/i18n/core.ts";
import type { Translate } from "../lib/messages.ts";
import type { Me } from "../lib/api.ts";

export interface AppShellProps {
  me: Me;
  t: Translate;
  locale: Locale;
  onLocaleChange(locale: Locale): void;
  onSignOut(): void;
  children: ReactNode;
}

export function AppShell({ me, t, locale, onLocaleChange, onSignOut, children }: AppShellProps) {
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

      <main className="page">{children}</main>

      <footer className="page-footer">
        <p className="muted">{t("app.tagline")}</p>
      </footer>
    </div>
  );
}
