/**
 * Locale plumbing (ADR-0008): ICU MessageFormat messages from the JSON catalogs, one
 * place that formats numbers and dates, and the Bengali/Latin digit choice that follows
 * the business setting.
 *
 * Deliberately free of DOM, React and Node APIs so the browser, the tests and (later) the
 * PDF renderer all use exactly the same formatting rules.
 */
import { createIntl, createIntlCache } from "@formatjs/intl";

export type Locale = "en" | "bn";
export type Messages = Record<string, string>;
export type NumberingSystem = "bengali" | "latin";
export type MessageValues = Record<string, string | number | boolean | Date | null | undefined>;

export const LOCALES: readonly Locale[] = ["en", "bn"];

const DEFAULT_LOCALE: Locale = "en";
const INTL_LOCALE: Record<Locale, string> = { en: "en-BD", bn: "bn-BD" };

/**
 * Latin digits group in lakh/crore only under an Indian English locale; `en-BD` formats
 * western thousands (`1,234,567`) in current ICU data, which spec 9.5 rules out.
 */
const LATIN_NUMBER_LOCALE = "en-IN";

export function isLocale(value: unknown): value is Locale {
  return value === "en" || value === "bn";
}

/** `bn-BD`, `bn`, `BN_bd` → `bn`. Anything unknown → null. */
export function parseLocale(value: string | null | undefined): Locale | null {
  if (!value) return null;
  const base = value.trim().toLowerCase().split(/[-_]/)[0] ?? "";
  return isLocale(base) ? base : null;
}

/**
 * First recognisable candidate wins. Callers pass them in priority order: explicit
 * `?lang=`, the stored preference, then the browser's language.
 */
export function chooseLocale(candidates: Array<string | null | undefined>): Locale {
  for (const candidate of candidates) {
    const locale = parseLocale(candidate);
    if (locale) return locale;
  }
  return DEFAULT_LOCALE;
}

export function otherLocale(locale: Locale): Locale {
  return locale === "en" ? "bn" : "en";
}

export function localeLabel(locale: Locale): string {
  return locale === "bn" ? "বাংলা" : "English";
}

export interface Translator<K extends string = string> {
  locale: Locale;
  /** Format one message id. A missing id returns the id itself and is remembered. */
  t(key: K, values?: MessageValues): string;
  /** Ids that were asked for but exist in neither catalog. */
  missingKeys(): string[];
}

export interface TranslatorOptions<M extends Messages> {
  locale: Locale;
  /** English is the fallback for every id the other catalog has not translated yet. */
  catalogs: { en: M; bn: M };
}

/**
 * English supplies the base messages and the chosen locale overlays them, so a key that
 * is still untranslated shows English instead of a raw id.
 */
export function createTranslator<M extends Messages>(
  options: TranslatorOptions<M>
): Translator<keyof M & string> {
  const { locale, catalogs } = options;
  const cache = createIntlCache();
  const merged: Record<string, string> = { ...catalogs.en, ...catalogs[locale] };
  const missing = new Set<string>();

  const intl = createIntl(
    {
      locale: INTL_LOCALE[locale],
      defaultLocale: INTL_LOCALE[DEFAULT_LOCALE],
      messages: merged,
      onError: (error) => {
        // Missing translations are expected while a catalog is being filled in; the
        // fallback above handles them. Anything else is a malformed message and must be
        // visible in the console, not silently rendered.
        if (error.code !== "MISSING_TRANSLATION") console.error(error);
      },
    },
    cache
  );

  function t(key: string, values?: MessageValues): string {
    if (!Object.hasOwn(merged, key)) {
      missing.add(key);
      return key;
    }
    try {
      return intl.formatMessage({ id: key, defaultMessage: key }, values);
    } catch (error) {
      missing.add(key);
      console.error(`i18n: cannot format ${key}`, error);
      return key;
    }
  }

  return { locale, t: t as Translator<keyof M & string>["t"], missingKeys: () => [...missing].sort() };
}

/** Unicode numbering-system extension for the chosen business setting. */
export function intlTag(locale: Locale, numberingSystem: NumberingSystem): string {
  const base = locale === "bn" ? "bn-BD" : LATIN_NUMBER_LOCALE;
  const digits = numberingSystem === "bengali" ? "beng" : "latn";
  return `${base}-u-nu-${digits}`;
}

export interface NumberFormatOptions {
  minimumFractionDigits?: number;
  maximumFractionDigits?: number;
}

export function formatNumber(
  value: number,
  locale: Locale,
  numberingSystem: NumberingSystem,
  options: NumberFormatOptions = {}
): string {
  if (!Number.isFinite(value)) throw new RangeError("formatNumber needs a finite number");
  return new Intl.NumberFormat(intlTag(locale, numberingSystem), {
    maximumFractionDigits: 2,
    ...options,
  }).format(value);
}

export type DateValue = string | number | Date;

export function formatDate(
  value: DateValue,
  locale: Locale,
  numberingSystem: NumberingSystem,
  options: Intl.DateTimeFormatOptions = {}
): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) throw new RangeError("formatDate needs a valid date");
  return new Intl.DateTimeFormat(intlTag(locale, numberingSystem), {
    dateStyle: "medium",
    timeZone: "Asia/Dhaka",
    ...options,
  }).format(date);
}

export function formatDateTime(
  value: DateValue,
  locale: Locale,
  numberingSystem: NumberingSystem
): string {
  return formatDate(value, locale, numberingSystem, {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Dhaka",
  });
}

/** Long month name for the fiscal-year selector; month is 1–12. */
export function monthName(
  month: number,
  locale: Locale,
  numberingSystem: NumberingSystem
): string {
  if (!Number.isInteger(month) || month < 1 || month > 12) {
    throw new RangeError("month must be an integer between 1 and 12");
  }
  return new Intl.DateTimeFormat(intlTag(locale, numberingSystem), {
    month: "long",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(2024, month - 1, 15)));
}
