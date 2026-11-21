/**
 * The owner portal. The session decides whether anything renders at all: the sign-in
 * screen until the server confirms the cookie, then the shell. The URL decides which
 * screen inside the shell. No route or screen trusts a stored user object — every load
 * asks `/api/v1/me`.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import type { Locale } from "../../../packages/config/i18n/core.ts";
import { AppShell } from "./components/AppShell.tsx";
import { createApiClient, type Me } from "./lib/api.ts";
import { applyDocumentLocale, detectLocale, readStoredLocale, storeLocale } from "./lib/locale.ts";
import { translatorFor } from "./lib/messages.ts";
import { resolveRoute, useRouter } from "./lib/router.ts";
import { DashboardScreen } from "./screens/DashboardScreen.tsx";
import { NotFoundScreen } from "./screens/NotFoundScreen.tsx";
import { ProfileScreen } from "./screens/ProfileScreen.tsx";
import { SignInScreen } from "./screens/SignInScreen.tsx";

type SessionState =
  | { status: "loading" }
  | { status: "signedOut" }
  | { status: "signedIn"; me: Me };

export function App() {
  const api = useMemo(() => createApiClient(), []);
  const { path, navigate } = useRouter();
  const route = resolveRoute(path);
  const [locale, setLocale] = useState<Locale>(() =>
    detectLocale({
      query: new URLSearchParams(window.location.search).get("lang"),
      stored: readStoredLocale(),
      browser: navigator.language,
    })
  );
  const t = useMemo(() => translatorFor(locale).t, [locale]);
  const [session, setSession] = useState<SessionState>({ status: "loading" });
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    applyDocumentLocale(locale);
    storeLocale(locale);
  }, [locale]);

  useEffect(() => {
    let active = true;
    api
      .me()
      .then((me) => {
        if (active) setSession({ status: "signedIn", me });
      })
      .catch(() => {
        if (active) setSession({ status: "signedOut" });
      });
    return () => {
      active = false;
    };
  }, [api]);

  const handleSignedIn = useCallback(async () => {
    const me = await api.me();
    setNotice(null);
    setSession({ status: "signedIn", me });
  }, [api]);

  async function handleSignOut() {
    try {
      await api.logout();
    } catch {
      // The cookie is cleared by the response; a failed call must not trap the user.
    }
    setSession({ status: "signedOut" });
  }

  const handleSessionLost = useCallback(() => {
    setNotice(t("auth.sessionExpired"));
    setSession({ status: "signedOut" });
  }, [t]);

  if (session.status === "loading") {
    return (
      <main className="boot">
        <p className="muted">{t("common.loading")}</p>
      </main>
    );
  }

  if (session.status === "signedOut") {
    return (
      <SignInScreen
        api={api}
        t={t}
        locale={locale}
        onLocaleChange={setLocale}
        onSignedIn={handleSignedIn}
        notice={notice}
      />
    );
  }

  const screen =
    route.id === "dashboard" ? (
      <DashboardScreen
        api={api}
        me={session.me}
        t={t}
        locale={locale}
        onSessionLost={handleSessionLost}
        onNavigate={navigate}
      />
    ) : route.id === "profile" ? (
      <ProfileScreen
        api={api}
        me={session.me}
        t={t}
        locale={locale}
        onSessionLost={handleSessionLost}
      />
    ) : (
      <NotFoundScreen t={t} onBack={() => navigate("/")} />
    );

  return (
    <AppShell
      me={session.me}
      t={t}
      locale={locale}
      onLocaleChange={setLocale}
      onSignOut={() => void handleSignOut()}
      path={route.path}
      onNavigate={navigate}
    >
      {screen}
    </AppShell>
  );
}
