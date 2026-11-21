/**
 * Where the language choice is remembered. A `?lang=bn` link wins over the stored
 * preference, which wins over the browser's own language, so a link shared between two
 * people opens in the language the sender intended.
 */
import { chooseLocale, type Locale } from "../../../../packages/config/i18n/core.ts";

export const LOCALE_STORAGE_KEY = "mbs.locale";

export function detectLocale(input: {
  query?: string | null;
  stored?: string | null;
  browser?: string | null;
}): Locale {
  return chooseLocale([input.query, input.stored, input.browser]);
}

export function readStoredLocale(): string | null {
  try {
    return window.localStorage.getItem(LOCALE_STORAGE_KEY);
  } catch {
    return null;
  }
}

export function storeLocale(locale: Locale): void {
  try {
    window.localStorage.setItem(LOCALE_STORAGE_KEY, locale);
  } catch {
    // Private mode or a storage quota failure: the choice still applies to this visit.
  }
}

export function applyDocumentLocale(locale: Locale): void {
  document.documentElement.lang = locale === "bn" ? "bn-BD" : "en-BD";
  document.documentElement.dataset.locale = locale;
}
