/**
 * The catalog contract, ICU messages, and the digit/date rules from ADR-0008. No DOM is
 * involved, so these run straight on Node.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  chooseLocale,
  createTranslator,
  formatDate,
  formatDateTime,
  formatNumber,
  localeLabel,
  monthName,
  parseLocale,
} from "../../../packages/config/i18n/core.ts";
import { detectLocale } from "../src/lib/locale.ts";

function load(locale: "en" | "bn") {
  return JSON.parse(
    readFileSync(new URL(`../../../packages/config/i18n/${locale}.json`, import.meta.url), "utf8")
  ) as Record<string, string>;
}

const en = load("en");
const bn = load("bn");

test("both catalogs carry exactly the same message ids", () => {
  assert.deepEqual(Object.keys(bn).sort(), Object.keys(en).sort());
});

test("every message is non-empty and uses the same placeholders", () => {
  const variables = (message: string) =>
    [...message.matchAll(/\{\s*([A-Za-z][A-Za-z0-9_]*)\s*[,}]/g)].map((match) => match[1]).sort();

  for (const key of Object.keys(en)) {
    const english = en[key] ?? "";
    const bengali = bn[key] ?? "";
    assert.ok(english.trim().length > 0, `${key} is empty in en`);
    assert.ok(bengali.trim().length > 0, `${key} is empty in bn`);
    assert.deepEqual(variables(bengali), variables(english), `${key} placeholders differ`);
  }
});

test("translates and interpolates in both languages", () => {
  const english = createTranslator({ locale: "en", catalogs: { en, bn } });
  const bengali = createTranslator({ locale: "bn", catalogs: { en, bn } });

  assert.equal(english.t("auth.signIn"), "Sign in");
  assert.equal(bengali.t("auth.signIn"), "সাইন ইন");
  assert.equal(
    english.t("common.signedInAs", { email: "owner@mooral.test" }),
    "Signed in as owner@mooral.test"
  );
  assert.equal(bengali.t("common.signedInAs", { email: "a@b.test" }), "a@b.test হিসেবে সাইন ইন করা আছে");
});

test("plural messages follow ICU rules in both languages", () => {
  const english = createTranslator({ locale: "en", catalogs: { en, bn } });
  const bengali = createTranslator({ locale: "bn", catalogs: { en, bn } });

  assert.equal(english.t("auth.locked", { minutes: 1 }), "Too many attempts. Try again in 1 minute.");
  assert.equal(english.t("auth.locked", { minutes: 5 }), "Too many attempts. Try again in 5 minutes.");
  const bangla = bengali.t("auth.locked", { minutes: 5 });
  assert.match(bangla, /৫/);
});

test("a missing id falls back to the id and is reported", () => {
  const translator = createTranslator({ locale: "bn", catalogs: { en, bn } });
  assert.equal(translator.t("profile.doesNotExist"), "profile.doesNotExist");
  assert.deepEqual(translator.missingKeys(), ["profile.doesNotExist"]);
});

test("locale parsing and priority: query, then stored, then browser", () => {
  assert.equal(parseLocale("bn-BD"), "bn");
  assert.equal(parseLocale("EN_bd"), "en");
  assert.equal(parseLocale("fr-FR"), null);
  assert.equal(chooseLocale(["fr", "bn-BD", "en"]), "bn");
  assert.equal(chooseLocale([null, undefined]), "en");
  assert.equal(detectLocale({ query: "en", stored: "bn", browser: "bn-BD" }), "en");
  assert.equal(detectLocale({ query: null, stored: "bn", browser: "en-US" }), "bn");
  assert.equal(detectLocale({ browser: "bn-BD" }), "bn");
  assert.equal(localeLabel("bn"), "বাংলা");
});

test("numbers use Bengali or Latin digits with lakh/crore grouping", () => {
  assert.equal(formatNumber(1234567, "bn", "bengali"), "১২,৩৪,৫৬৭");
  assert.equal(formatNumber(1234567, "bn", "latin"), "12,34,567");
  assert.equal(formatNumber(1234567, "en", "latin"), "12,34,567");
  assert.equal(formatNumber(1234567, "en", "bengali"), "১২,৩৪,৫৬৭");
  assert.equal(formatNumber(0.5, "en", "bengali"), "০.৫");
  assert.throws(() => formatNumber(Number.NaN, "en", "latin"), RangeError);
});

test("dates render in Asia/Dhaka and follow the digit setting", () => {
  // 20:00 UTC is already the next day in Dhaka.
  const latin = formatDate("2026-11-21T20:00:00Z", "en", "latin");
  assert.equal(latin, "22 Nov 2026");
  const bengali = formatDate("2026-11-21T20:00:00Z", "bn", "bengali");
  assert.match(bengali, /২২/);
  assert.match(formatDateTime("2026-11-21T10:00:00Z", "en", "latin"), /21 Nov 2026/);
  assert.throws(() => formatDate("not a date", "en", "latin"), RangeError);
});

test("fiscal month names come from Intl, not a hardcoded list", () => {
  assert.equal(monthName(7, "en", "latin"), "July");
  assert.equal(monthName(1, "bn", "bengali"), "জানুয়ারি");
  assert.throws(() => monthName(13, "en", "latin"), RangeError);
});
