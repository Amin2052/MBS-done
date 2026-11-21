/**
 * The catalogs, typed. Every message id used by a screen must exist in `en`; the type
 * checker enforces that `bn` has exactly the same ids, and `tools/check-i18n.mjs` checks
 * the same thing plus placeholder parity during `npm run verify`.
 */
import bn from "../../../../packages/config/i18n/bn.json";
import en from "../../../../packages/config/i18n/en.json";
import { createTranslator, type Locale } from "../../../../packages/config/i18n/core.ts";

type Catalog = typeof en;

/** Compile-time proof that both catalogs carry the same ids. */
const catalogs: { en: Catalog; bn: Catalog } = { en, bn };

export type MessageKey = keyof Catalog;

export function translatorFor(locale: Locale) {
  return createTranslator<Catalog>({ locale, catalogs });
}

export type AppTranslator = ReturnType<typeof translatorFor>;
/** Screens receive the function, not the object that owns it. */
export type Translate = AppTranslator["t"];
