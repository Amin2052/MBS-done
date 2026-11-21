/**
 * The dashboard. Every number on this screen comes from `/api/v1/dashboard`, which reads
 * the tenant tables inside the session's tenant context; nothing here is a placeholder or
 * invented sample.
 *
 * The ERP modules that will add sales, stock and money widgets are not built yet, so this
 * screen shows only facts that exist today: the business profile, the team and the
 * append-only activity log. Adding a widget before its module exists would be a lie.
 */
import { useCallback, useEffect, useState, type MouseEvent } from "react";
import type { Locale } from "../../../../packages/config/i18n/core.ts";
import { formatDateTime, formatNumber, monthName } from "../../../../packages/config/i18n/core.ts";
import { Banner, Button } from "../components/ui.tsx";
import { ApiClientError, type ApiClient, type Me } from "../lib/api.ts";
import type { MessageKey, Translate } from "../lib/messages.ts";
import { shouldNavigate } from "../lib/router.ts";

const ROLE_KEYS = ["owner", "manager", "accountant", "employee"] as const;

/** Known audit actions get a sentence; an unknown action is shown as recorded. */
const ACTIVITY_KEYS: Record<string, MessageKey> = {
  "auth.login": "activity.auth.login",
  "auth.logout": "activity.auth.logout",
  "auth.mfa_enroll": "activity.auth.mfa_enroll",
  "org.update": "activity.org.update",
};

export interface DashboardScreenProps {
  api: ApiClient;
  me: Me;
  t: Translate;
  locale: Locale;
  onSessionLost(): void;
  onNavigate(path: string): void;
}

export function DashboardScreen({
  api,
  me,
  t,
  locale,
  onSessionLost,
  onNavigate,
}: DashboardScreenProps) {
  const [summary, setSummary] = useState<Awaited<ReturnType<ApiClient["getDashboard"]>> | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadFailed(false);
    try {
      setSummary(await api.getDashboard());
    } catch (error) {
      if (error instanceof ApiClientError && error.status === 401) {
        onSessionLost();
        return;
      }
      setLoadFailed(true);
    } finally {
      setLoading(false);
    }
  }, [api, onSessionLost]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) return <p className="muted page-loading">{t("common.loading")}</p>;

  if (loadFailed || !summary) {
    return (
      <div className="card card-message">
        <Banner tone="error">{t("dashboard.loadFailed")}</Banner>
        <Button variant="secondary" onClick={() => void load()}>
          {t("common.retry")}
        </Button>
      </div>
    );
  }

  const { business, team, activity } = summary;
  const digits = business.numberingSystem;

  function activityLabel(action: string): string {
    const key = ACTIVITY_KEYS[action];
    return key ? t(key) : t("activity.unknown", { action });
  }

  function follow(event: MouseEvent<HTMLAnchorElement>, href: string) {
    if (!shouldNavigate(event, href, window.location.origin)) return;
    event.preventDefault();
    onNavigate(href);
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">{t("dashboard.title")}</h1>
          <p className="page-subtitle">{t("dashboard.subtitle", { business: business.name })}</p>
        </div>
        <p className="meta-line">{t("dashboard.greeting", { email: me.user.email })}</p>
      </div>

      <div className="dash-grid">
        <section className="card dash-card dash-card-wide">
          <div className="card-head">
            <h2 className="card-title">{t("dashboard.businessTitle")}</h2>
            <a className="text-link" href="/profile" onClick={(event) => follow(event, "/profile")}>
              {t("nav.profile")}
            </a>
          </div>
          <dl className="detail-grid">
            <div className="detail-row">
              <dt>{t("dashboard.legalName")}</dt>
              <dd>{business.legalName ?? t("common.empty")}</dd>
            </div>
            <div className="detail-row">
              <dt>{t("dashboard.bin")}</dt>
              <dd>{business.bin ?? t("dashboard.binMissing")}</dd>
            </div>
            <div className="detail-row">
              <dt>{t("dashboard.currency")}</dt>
              <dd>{business.currency}</dd>
            </div>
            <div className="detail-row">
              <dt>{t("dashboard.fiscalYear")}</dt>
              <dd>{monthName(business.fiscalYearStartMonth, locale, digits)}</dd>
            </div>
            <div className="detail-row">
              <dt>{t("dashboard.vat")}</dt>
              <dd>{business.vatRegistered ? t("dashboard.vatOn") : t("dashboard.vatOff")}</dd>
            </div>
          </dl>
        </section>

        <section className="card dash-card">
          <h2 className="card-title">{t("dashboard.teamTitle")}</h2>
          <p className="stat-value">{formatNumber(team.active, locale, digits)}</p>
          <p className="muted">{t("dashboard.teamActive", { count: team.active })}</p>
          <ul className="role-list">
            {ROLE_KEYS.map((role) => (
              <li className="role-row" key={role}>
                <span>{t(`role.${role}`)}</span>
                <span className="role-count">{formatNumber(team.byRole[role], locale, digits)}</span>
              </li>
            ))}
          </ul>
        </section>

        <section className="card dash-card">
          <h2 className="card-title">{t("dashboard.sessionTitle")}</h2>
          <p className="stat-note">{t("dashboard.sessionRole", { role: t(`role.${me.role}`) })}</p>
          <p className="muted">
            {t("dashboard.sessionExpires", {
              date: formatDateTime(summary.session.expiresAt, locale, digits),
            })}
          </p>
        </section>

        <section className="card dash-card dash-card-wide">
          <h2 className="card-title">{t("dashboard.activityTitle")}</h2>
          {activity.length === 0 ? (
            <p className="muted">{t("dashboard.activityEmpty")}</p>
          ) : (
            <ul className="activity-list">
              {activity.map((entry) => (
                <li className="activity-item" key={entry.id}>
                  <span className="activity-dot" aria-hidden="true" />
                  <span className="activity-label">{activityLabel(entry.action)}</span>
                  <time className="activity-time" dateTime={entry.createdAt}>
                    {formatDateTime(entry.createdAt, locale, digits)}
                  </time>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </>
  );
}
