/**
 * Sign in (R-045 stays open for the second factor), including the one case the server
 * answers with a list instead of a session: an account that belongs to several businesses.
 */
import { useState, type FormEvent } from "react";
import type { Locale } from "../../../../packages/config/i18n/core.ts";
import { ApiClientError, type ApiClient, type TenantSummary } from "../lib/api.ts";
import type { Translate } from "../lib/messages.ts";
import { Banner, Button, Field, describedBy } from "../components/ui.tsx";

export interface SignInScreenProps {
  api: ApiClient;
  t: Translate;
  locale: Locale;
  onLocaleChange(locale: Locale): void;
  onSignedIn(): Promise<void>;
  /** Set when a session ended mid-use, so the reason is not a mystery. */
  notice?: string | null;
}

type Failure = { kind: "text"; message: string } | { kind: "tenants"; tenants: TenantSummary[] };

export function SignInScreen({ api, t, locale, onLocaleChange, onSignedIn, notice }: SignInScreenProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [tenantSlug, setTenantSlug] = useState<string | null>(null);
  const [failure, setFailure] = useState<Failure | null>(null);
  const [touched, setTouched] = useState(false);
  const [pending, setPending] = useState(false);

  const emailMissing = email.trim() === "";
  const passwordMissing = password === "";
  const showEmailError = touched && emailMissing;
  const showPasswordError = touched && passwordMissing;

  function failureFor(error: unknown): { failure: Failure; slug: string | null } {
    if (!(error instanceof ApiClientError)) {
      return { failure: { kind: "text", message: t("errors.generic") }, slug: null };
    }
    const choices = error.tenantChoices;
    if (choices && choices.length > 0) {
      return {
        failure: { kind: "tenants", tenants: choices },
        slug: choices[0]?.slug ?? null,
      };
    }
    if (error.status === 0) {
      return { failure: { kind: "text", message: t("errors.network") }, slug: null };
    }
    if (error.status === 401 || error.code === "invalid_credentials") {
      return { failure: { kind: "text", message: t("auth.invalidCredentials") }, slug: null };
    }
    if (error.status === 429) {
      const minutes = Math.max(1, Math.ceil((error.retryAfterSeconds ?? 15 * 60) / 60));
      return { failure: { kind: "text", message: t("auth.locked", { minutes }) }, slug: null };
    }
    if (error.status === 403) {
      return { failure: { kind: "text", message: t("errors.forbidden") }, slug: null };
    }
    return { failure: { kind: "text", message: t("errors.generic") }, slug: null };
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setTouched(true);
    if (emailMissing || passwordMissing) return;
    if (failure?.kind === "tenants" && !tenantSlug) {
      setFailure({ kind: "text", message: t("auth.businessRequired") });
      return;
    }

    setPending(true);
    setFailure(null);
    try {
      await api.login({
        email: email.trim(),
        password,
        ...(tenantSlug ? { tenantSlug } : {}),
      });
      await onSignedIn();
    } catch (error) {
      const mapped = failureFor(error);
      setTenantSlug(mapped.slug);
      setFailure(mapped.failure);
    } finally {
      setPending(false);
    }
  }

  return (
    <main className="signin">
      <section className="signin-brand" aria-labelledby="signin-brand-name">
        <p className="eyebrow">{t("app.tagline")}</p>
        <h2 className="brand-title" id="signin-brand-name">
          {t("app.name")}
        </h2>
        <p className="brand-copy">{t("auth.secureNote")}</p>
      </section>

      <section className="signin-panel" aria-labelledby="signin-title">
        <div className="signin-head">
          <h1 className="page-title" id="signin-title">
            {t("auth.signIn")}
          </h1>
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
        </div>
        <p className="page-subtitle">{t("auth.subtitle")}</p>

        {notice ? <Banner tone="error">{notice}</Banner> : null}
        {failure?.kind === "text" ? <Banner tone="error">{failure.message}</Banner> : null}

        <form className="signin-form" onSubmit={submit} noValidate>
          <Field
            id="signin-email"
            label={t("auth.email")}
            error={showEmailError ? t("common.required") : undefined}
          >
            <input
              id="signin-email"
              className="input"
              type="email"
              name="email"
              autoComplete="username"
              inputMode="email"
              placeholder={t("auth.emailPlaceholder")}
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              aria-invalid={showEmailError || undefined}
              {...describedBy("signin-email", { error: showEmailError ? "required" : undefined })}
              required
              autoFocus
            />
          </Field>

          <Field
            id="signin-password"
            label={t("auth.password")}
            hint={t("auth.passwordHint")}
            error={showPasswordError ? t("common.required") : undefined}
          >
            <div className="password-wrap">
              <input
                id="signin-password"
                className="input"
                type={showPassword ? "text" : "password"}
                name="password"
                autoComplete="current-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                aria-invalid={showPasswordError || undefined}
                {...describedBy("signin-password", {
                  hint: t("auth.passwordHint"),
                  error: showPasswordError ? "required" : undefined,
                })}
                required
              />
              <button
                type="button"
                className="password-toggle"
                onClick={() => setShowPassword((current) => !current)}
                aria-pressed={showPassword}
              >
                {showPassword ? t("auth.hidePassword") : t("auth.showPassword")}
              </button>
            </div>
          </Field>

          {failure?.kind === "tenants" ? (
            <fieldset className="choice-list">
              <legend className="choice-legend">{t("auth.chooseBusinessTitle")}</legend>
              <p className="field-hint">{t("auth.chooseBusinessBody")}</p>
              {failure.tenants.map((tenant) => (
                <label className="choice" key={tenant.id}>
                  <input
                    type="radio"
                    name="business"
                    value={tenant.slug}
                    checked={tenantSlug === tenant.slug}
                    onChange={() => setTenantSlug(tenant.slug)}
                  />
                  <span>{tenant.name}</span>
                </label>
              ))}
            </fieldset>
          ) : null}

          <Button type="submit" loading={pending}>
            {pending ? t("auth.submitting") : t("auth.signIn")}
          </Button>
        </form>
      </section>
    </main>
  );
}
