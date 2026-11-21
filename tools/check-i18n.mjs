#!/usr/bin/env node
/**
 * tools/check-i18n.mjs — the i18n build gate (ADR-0008, spec 9.5).
 *
 * Fails when:
 *   - the two catalogs do not carry exactly the same message ids;
 *   - a message is empty, or its `{placeholders}` differ between languages;
 *   - a screen asks for an id that neither catalog has;
 *   - a screen contains literal UI text: text between JSX tags, or a literal
 *     placeholder / aria-label / title / alt.
 *
 * A deliberate exception is marked with `i18n-exempt` on the same line.
 *
 * Usage: node tools/check-i18n.mjs
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, extname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const CATALOG_DIR = join(ROOT, "packages/config/i18n");
const WEB_SRC = join(ROOT, "apps/web/src");

const failures = [];

const en = JSON.parse(readFileSync(join(CATALOG_DIR, "en.json"), "utf8"));
const bn = JSON.parse(readFileSync(join(CATALOG_DIR, "bn.json"), "utf8"));

const enKeys = Object.keys(en).sort();
const bnKeys = Object.keys(bn).sort();

for (const key of enKeys) {
  if (!Object.hasOwn(bn, key)) failures.push(`bn.json is missing "${key}"`);
  else if (typeof bn[key] !== "string" || bn[key].trim() === "") {
    failures.push(`bn.json "${key}" is empty`);
  }
}
for (const key of bnKeys) {
  if (!Object.hasOwn(en, key)) failures.push(`en.json is missing "${key}" (present only in bn.json)`);
}
for (const key of enKeys) {
  if (typeof en[key] !== "string" || en[key].trim() === "") {
    failures.push(`en.json "${key}" is empty`);
  }
}

/**
 * Variables a message uses, including the plural selector's variable. Compared as a set
 * so a translation cannot silently drop or rename the value a screen passes.
 */
function placeholders(message) {
  const found = new Set();
  for (const match of message.matchAll(/\{\s*([A-Za-z][A-Za-z0-9_]*)\s*[,}]/g)) {
    found.add(match[1]);
  }
  return [...found].sort();
}

for (const key of enKeys) {
  if (!Object.hasOwn(bn, key)) continue;
  const a = placeholders(en[key]).join(",");
  const b = placeholders(bn[key]).join(",");
  if (a !== b) {
    failures.push(`"${key}" placeholders differ: en {${a}} vs bn {${b}}`);
  }
}

const files = [];
function walk(directory) {
  for (const entry of readdirSync(directory)) {
    const full = join(directory, entry);
    if (statSync(full).isDirectory()) walk(full);
    else if ([".ts", ".tsx"].includes(extname(full))) files.push(full);
  }
}
walk(WEB_SRC);

const usedKeys = new Set();
const USED_KEY = /\bt\(\s*["']([^"']+)["']/g;
/** Literal text between tags: `>Sign in<`. */
const JSX_TEXT = />\s*([A-Za-z\u0980-\u09FF][^<>{}]*?)\s*</g;
const LITERAL_ATTRIBUTE = /\b(placeholder|aria-label|title|alt)\s*=\s*"([^"]*)"/g;

for (const file of files) {
  const rel = relative(ROOT, file);
  const lines = readFileSync(file, "utf8").split("\n");
  lines.forEach((line, index) => {
    if (line.includes("i18n-exempt")) return;
    const trimmed = line.trim();
    if (trimmed.startsWith("//") || trimmed.startsWith("*") || trimmed.startsWith("/*")) return;
    if (trimmed.startsWith("{/*")) return;

    for (const match of line.matchAll(USED_KEY)) usedKeys.add(match[1]);
    for (const match of line.matchAll(JSX_TEXT)) {
      const text = match[1].trim();
      if (text.length === 0) continue;
      failures.push(`${rel}:${index + 1} literal text "${text}" — use t("…")`);
    }
    for (const match of line.matchAll(LITERAL_ATTRIBUTE)) {
      if (match[2].trim() === "") continue;
      failures.push(
        `${rel}:${index + 1} literal ${match[1]} "${match[2]}" — use a t("…") value`
      );
    }
  });
}

for (const key of usedKeys) {
  if (!Object.hasOwn(en, key)) failures.push(`a screen uses "${key}", which is not in en.json`);
}

if (failures.length) {
  for (const failure of failures) console.error(`FAIL ${failure}`);
  console.error(`\n${failures.length} i18n check(s) failed`);
  process.exit(1);
}

console.log(
  `OK ${enKeys.length} messages in en and bn, ${usedKeys.size} ids used by ${files.length} screen files`
);
