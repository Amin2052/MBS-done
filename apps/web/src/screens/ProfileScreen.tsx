/**
 * The business profile: the legal details that later appear on invoices and certificates.
 * Owners and managers may edit; everyone else sees the same screen read-only, because an
 * owner still needs to check what is on file.
 */
import { useCallback, useEffect, useState, type FormEvent } from "react";
import type { Locale } from "../../../../packages/config/i18n/core.ts";
import { formatDateTime, monthName } from "../../../../packages/config/i18n/core.ts";
import { ApiClientError, type ApiClient, type Me, type OrgSettings } from "../lib/api.ts";
import {
  diffPatch,
  isDirty,
  toFormValues,
  validateForm,
  type OrgErrors,
  type OrgField,
  type OrgFormValues,
} from "../lib/orgForm.ts";
import type { Translate } from "../lib/messages.ts";
import { Banner, Button, Field, describedBy } from "../components/ui.tsx";

export interface ProfileScreenProps {
  api: ApiClient;
  me: Me;
  t: Translate;
  locale: Locale;
  onSessionLost(): void;
}

const MONTHS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

export function ProfileScreen({ api, me, t, locale, onSessionLost }: ProfileScreenProps) {
  const [org, setOrg] = useState<OrgSettings | null>(null);
  const [baseline, setBaseline] = useState<OrgFormValues | null>(null);
  const [form, setForm] = useState<OrgFormValues | null>(null);
  const [errors, setErrors] = useState<OrgErrors>({});
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [banner, setBanner] = useState<{ tone: "error" | "success"; text: string } | null>(null);

  const canEdit = me.role === "owner" || me.role === "manager";

  const load = useCallback(async () => {
    setLoading(true);
    setLoadFailed(false);
    try {
      const loaded = await api.getOrg();
      const values = toFormValues(loaded);
      setOrg(loaded);
      setBaseline(values);
      setForm(values);
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

  const dirty = Boolean(baseline && form && isDirty(baseline, form));

  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  function update<K extends OrgField>(field: K, value: OrgFormValues[K]) {
    setForm((current) => (current ? { ...current, [field]: value } : current));
    setErrors((current) => {
      if (!(field in current)) return current;
      const next = { ...current };
      delete next[field];
      return next;
    });
    setBanner(null);
  }

  function revert() {
    if (dirty && !window.confirm(t("profile.unsaved"))) return;
    if (baseline) setForm(baseline);
    setErrors({});
    setBanner(null);
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!baseline || !form || !canEdit) return;

    const found = validateForm(form, { emailInvalid: t("profile.emailInvalid") });
    if (Object.keys(found).length > 0) {
      setErrors(found);
      return;
    }

    const patch = diffPatch(baseline, form);
    if (Object.keys(patch).length === 0) {
      setBanner({ tone: "success", text: t("profile.noChanges") });
      return;
    }

    setSaving(true);
    setBanner(null);
    try {
      const updated = await api.updateOrg(patch);
      const values = toFormValues(updated);
      setOrg(updated);
      setBaseline(values);
      setForm(values);
      setBanner({ tone: "success", text: t("profile.saved") });
    } catch (error) {
      if (error instanceof ApiClientError) {
        if (error.status === 401) {
          onSessionLost();
          return;
        }
        if (error.status === 0) {
          setBanner({ tone: "error", text: t("errors.network") });
          return;
        }
        if (error.status === 403) {
          setBanner({ tone: "error", text: t("errors.forbidden") });
          return;
        }
      }
      setBanner({ tone: "error", text: t("errors.generic") });
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <p className="muted page-loading">{t("common.loading")}</p>;

  if (loadFailed || !org || !form || !baseline) {
    return (
      <div className="card card-message">
        <Banner tone="error">{t("profile.loadFailed")}</Banner>
        <Button variant="secondary" onClick={() => void load()}>
          {t("common.retry")}
        </Button>
      </div>
    );
  }

  const digits = form.numberingSystem;

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">{t("profile.title")}</h1>
          <p className="page-subtitle">{t("profile.subtitle")}</p>
        </div>
        <p className="meta-line">{t("profile.updated", { date: formatDateTime(org.updatedAt, locale, digits) })}</p>
      </div>

      {!canEdit ? <Banner tone="success">{t("profile.readOnly")}</Banner> : null}
      {banner ? <Banner tone={banner.tone}>{banner.text}</Banner> : null}

      <form className="card profile-form" onSubmit={save} noValidate>
        <fieldset className="form-fieldset" disabled={!canEdit || saving}>
          <div className="field-grid">
            <Field id="org-legal-name" label={t("profile.legalName")} optional={t("common.optional")}>
              <input
                id="org-legal-name"
                className="input"
                value={form.legalName}
                maxLength={120}
                onChange={(event) => update("legalName", event.target.value)}
              />
            </Field>

            <Field
              id="org-bin"
              label={t("profile.bin")}
              hint={t("profile.binHint")}
              optional={t("common.optional")}
            >
              <input
                id="org-bin"
                className="input"
                value={form.bin}
                maxLength={40}
                onChange={(event) => update("bin", event.target.value)}
                {...describedBy("org-bin", { hint: t("profile.binHint") })}
              />
            </Field>

            <Field
              id="org-address"
              label={t("profile.address")}
              optional={t("common.optional")}
              error={errors.address}
            >
              <textarea
                id="org-address"
                className="input textarea"
                rows={3}
                value={form.address}
                maxLength={400}
                onChange={(event) => update("address", event.target.value)}
              />
            </Field>

            <Field id="org-phone" label={t("profile.phone")} optional={t("common.optional")}>
              <input
                id="org-phone"
                className="input"
                type="tel"
                value={form.phone}
                maxLength={40}
                onChange={(event) => update("phone", event.target.value)}
              />
            </Field>

            <Field
              id="org-email"
              label={t("profile.email")}
              optional={t("common.optional")}
              error={errors.email}
            >
              <input
                id="org-email"
                className="input"
                type="email"
                value={form.email}
                maxLength={254}
                onChange={(event) => update("email", event.target.value)}
                aria-invalid={errors.email ? true : undefined}
                {...describedBy("org-email", { error: errors.email })}
              />
            </Field>

            <Field id="org-digits" label={t("profile.digits")} hint={t("profile.digitsHint")}>
              <select
                id="org-digits"
                className="select"
                value={form.numberingSystem}
                onChange={(event) =>
                  update("numberingSystem", event.target.value === "latin" ? "latin" : "bengali")
                }
                {...describedBy("org-digits", { hint: t("profile.digitsHint") })}
              >
                <option value="bengali">{t("profile.digits.bengali")}</option>
                <option value="latin">{t("profile.digits.latin")}</option>
              </select>
            </Field>

            <Field id="org-fiscal" label={t("profile.fiscalYear")}>
              <select
                id="org-fiscal"
                className="select"
                value={form.fiscalYearStartMonth}
                onChange={(event) => update("fiscalYearStartMonth", Number(event.target.value))}
              >
                {MONTHS.map((month) => (
                  <option value={month} key={month}>
                    {monthName(month, locale, digits)}
                  </option>
                ))}
              </select>
            </Field>

            <div className="field">
              <span className="field-label">{t("profile.currency")}</span>
              <p className="static-value">{org.currency}</p>
            </div>

            <div className="field">
              <span className="field-label">{t("profile.timezone")}</span>
              <p className="static-value">{org.timezone}</p>
            </div>
          </div>

          <div className="checkbox-field">
            <label className="checkbox">
              <input
                type="checkbox"
                checked={form.vatRegistered}
                onChange={(event) => update("vatRegistered", event.target.checked)}
              />
              <span>{t("profile.vatRegistered")}</span>
            </label>
            <p className="field-hint">{t("profile.vatHint")}</p>
          </div>

          {canEdit ? (
            <div className="form-actions">
              <Button type="submit" loading={saving} disabled={!dirty}>
                {saving ? t("common.saving") : t("common.save")}
              </Button>
              <Button type="button" variant="secondary" onClick={revert} disabled={!dirty || saving}>
                {t("common.cancel")}
              </Button>
            </div>
          ) : null}
        </fieldset>
      </form>
    </>
  );
}
