/**
 * The second step of a sign-in: confirm a code, or — for an owner or manager signing in for
 * the first time — set the factor up and receive recovery codes.
 *
 * The screen keeps no secret beyond what the server sent for this challenge: the enrolment
 * secret is displayed once, straight from the response, and the recovery codes exist only
 * until the "continue" button is pressed. Nothing is stored in the browser.
 */
import { useState, type FormEvent } from "react";
import type { ApiClient, MfaChallenge } from "../lib/api.ts";
import { ApiClientError } from "../lib/api.ts";
import type { Translate } from "../lib/messages.ts";
import { Banner, Button, Field, describedBy } from "./ui.tsx";

export interface MfaStepProps {
  api: ApiClient;
  t: Translate;
  challenge: MfaChallenge;
  onSignedIn(): Promise<void>;
  onEnrolled(codes: string[]): void;
  onRestart(): void;
  /** Set when the code was rejected, so the reason survives a re-render. */
  notice?: string | null;
  onNotice(message: string | null): void;
}

export function MfaStep({
  api,
  t,
  challenge,
  onSignedIn,
  onEnrolled,
  onRestart,
  notice,
  onNotice,
}: MfaStepProps) {
  const enrolling = challenge.status === "enroll";
  const [code, setCode] = useState("");
  const [recovery, setRecovery] = useState(false);
  const [pending, setPending] = useState(false);
  const [touched, setTouched] = useState(false);

  const missing = code.trim() === "";
  const showError = touched && missing;

  function describe(error: unknown): string {
    if (!(error instanceof ApiClientError)) return t("errors.generic");
    if (error.status === 0) return t("errors.network");
    if (error.status === 429) {
      const minutes = Math.max(1, Math.ceil((error.retryAfterSeconds ?? 15 * 60) / 60));
      return t("auth.locked", { minutes });
    }
    if (error.code === "mfa_challenge_expired" || error.code === "mfa_challenge_invalid") {
      return t("auth.mfaExpired");
    }
    if (error.code === "mfa_invalid_code") {
      const remaining = error.details?.["attempts_remaining"];
      return typeof remaining === "number"
        ? t("auth.mfaInvalidCodeLeft", { count: remaining })
        : t("auth.mfaInvalidCode");
    }
    if (error.code === "too_many_attempts") return t("auth.mfaTooMany");
    if (error.status === 403) return t("errors.forbidden");
    return t("errors.generic");
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setTouched(true);
    if (missing) return;
    setPending(true);
    onNotice(null);
    try {
      if (enrolling) {
        const result = await api.mfaEnroll({ challengeToken: challenge.challengeToken, code: code.trim() });
        onEnrolled(result.recoveryCodes ?? []);
      } else {
        await api.mfaVerify({ challengeToken: challenge.challengeToken, code: code.trim() });
        await onSignedIn();
      }
    } catch (error) {
      const message = describe(error);
      onNotice(message);
      if (message === t("auth.mfaExpired")) {
        // The step is gone; only the password can start a new one.
        setTimeout(onRestart, 1200);
      }
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <div className="signin-head">
        <h1 className="page-title" id="mfa-title">
          {enrolling ? t("auth.mfaEnrollTitle") : t("auth.mfaTitle")}
        </h1>
      </div>
      <p className="page-subtitle" id="mfa-subtitle">
        {enrolling
          ? t("auth.mfaEnrollBody", { account: challenge.enrollment?.account ?? "" })
          : recovery
            ? t("auth.mfaRecoveryBody")
            : t("auth.mfaSubtitle")}
      </p>

      {enrolling && challenge.enrollment ? (
        <div className="mfa-secret">
          <p className="field-label">{t("auth.mfaSecretLabel")}</p>
          <code className="mfa-secret-value">{challenge.enrollment.secretDisplay}</code>
          <p className="field-hint">{t("auth.mfaSecretHint")}</p>
        </div>
      ) : null}

      {notice ? <Banner tone="error">{notice}</Banner> : null}

      <form className="signin-form" onSubmit={submit} noValidate aria-labelledby="mfa-title">
        <Field
          id="mfa-code"
          label={recovery ? t("auth.mfaRecoveryCode") : t("auth.mfaCode")}
          hint={enrolling ? t("auth.mfaCodeHintEnrol") : recovery ? t("auth.mfaRecoveryHint") : t("auth.mfaCodeHint")}
          error={showError ? t("common.required") : undefined}
        >
          <input
            id="mfa-code"
            className="input"
            type="text"
            name="code"
            inputMode={recovery ? "text" : "numeric"}
            autoComplete="one-time-code"
            spellCheck={false}
            autoCapitalize={recovery ? "characters" : "none"}
            placeholder={recovery ? t("auth.mfaRecoveryPlaceholder") : t("auth.mfaCodePlaceholder")}
            value={code}
            onChange={(event) => setCode(event.target.value)}
            aria-invalid={showError || undefined}
            {...describedBy("mfa-code", {
              hint: t("auth.mfaCodeHint"),
              error: showError ? "required" : undefined,
            })}
            required
            autoFocus
          />
        </Field>

        <Button type="submit" loading={pending}>
          {pending
            ? t("auth.mfaVerifying")
            : enrolling
              ? t("auth.mfaEnrollSubmit")
              : t("auth.mfaVerify")}
        </Button>

        {!enrolling ? (
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => {
              setRecovery((current) => !current);
              setCode("");
              setTouched(false);
              onNotice(null);
            }}
          >
            {recovery ? t("auth.mfaUseApp") : t("auth.mfaUseRecovery")}
          </button>
        ) : null}

        <button type="button" className="btn btn-ghost" onClick={onRestart}>
          {t("auth.mfaRestart")}
        </button>
      </form>
    </>
  );
}
