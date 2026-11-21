/**
 * The few primitives the first screens need. Labels always sit above a field, errors are
 * tied to their input with `aria-describedby`, and a button that is working says so.
 */
import type { ButtonHTMLAttributes, ReactNode } from "react";

export interface FieldProps {
  id: string;
  label: string;
  hint?: string;
  error?: string;
  optional?: string;
  children: ReactNode;
}

export function Field({ id, label, hint, error, optional, children }: FieldProps) {
  return (
    <div className={`field${error ? " field-invalid" : ""}`}>
      <label className="field-label" htmlFor={id}>
        {label}
        {optional ? <span className="field-optional">{optional}</span> : null}
      </label>
      {children}
      {error ? (
        <p className="field-error" id={`${id}-error`} role="alert">
          {error}
        </p>
      ) : hint ? (
        <p className="field-hint" id={`${id}-hint`}>
          {hint}
        </p>
      ) : null}
    </div>
  );
}

/** Spread onto an input so its hint or error is announced. */
export function describedBy(id: string, state: { hint?: string; error?: string }) {
  if (state.error) return { "aria-describedby": `${id}-error`, "aria-invalid": true as const };
  if (state.hint) return { "aria-describedby": `${id}-hint` };
  return {};
}

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "ghost";
  loading?: boolean;
}

export function Button({ variant = "primary", loading = false, className, children, ...rest }: ButtonProps) {
  return (
    <button
      {...rest}
      className={`btn btn-${variant}${className ? ` ${className}` : ""}`}
      disabled={rest.disabled || loading}
      aria-busy={loading || undefined}
    >
      {children}
    </button>
  );
}

export function Banner({ tone, children }: { tone: "error" | "success"; children: ReactNode }) {
  return (
    <p className={`banner banner-${tone}`} role={tone === "error" ? "alert" : "status"}>
      {children}
    </p>
  );
}
