#!/usr/bin/env node
/**
 * tools/check-repo.mjs — CI guard for the NEW repository.
 *
 * Fails when a required bootstrap file is missing, when a secret-bearing or
 * database file is tracked, or when AGENTS.md / STATE.md drift below their
 * minimum content. Runs with no dependencies so CI needs no install step.
 *
 * Usage: node tools/check-repo.mjs
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const failures = [];
const notes = [];

const required = [
  "AGENTS.md",
  "README.md",
  ".gitignore",
  ".gitattributes",
  "docs/STATE.md",
  "docs/PROGRESS.md",
  "docs/human-required.md",
  "docs/requirements.csv",
  "docs/ORIGINS.md",
  "docs/audit/old-baseline.txt",
  "tools/manifest.mjs",
  "tools/guard.mjs",
];

for (const rel of required) {
  if (!existsSync(resolve(ROOT, rel))) failures.push(`missing required file: ${rel}`);
}

const forbidden = [
  /(^|\/)\.env($|\.)/,
  /\.sqlite3?($|-)/,
  /\.db($|-)/,
  /(^|\/)id_rsa($|\.)/,
  /\.pem$/,
  /(^|\/)migration\/source-copies\//,
];

let tracked = [];
try {
  tracked = execFileSync("git", ["-C", ROOT, "ls-files"], { encoding: "utf8" })
    .split("\n")
    .filter(Boolean);
} catch {
  notes.push("not a git work tree — skipped tracked-file scan");
}

for (const file of tracked) {
  if (file === ".env.example") continue;
  for (const pattern of forbidden) {
    if (pattern.test(file)) failures.push(`forbidden file tracked: ${file}`);
  }
}

const statePath = resolve(ROOT, "docs/STATE.md");
if (existsSync(statePath)) {
  const state = readFileSync(statePath, "utf8");
  const lines = state.split("\n").length;
  if (lines > 80) failures.push(`docs/STATE.md is ${lines} lines (limit 80)`);
  if (!/OLD_BASELINE_SHA/.test(state)) failures.push("docs/STATE.md does not record OLD_BASELINE_SHA");
}

const agentsPath = resolve(ROOT, "AGENTS.md");
if (existsSync(agentsPath) && statSync(agentsPath).size < 500) {
  failures.push("AGENTS.md looks truncated");
}

const reqPath = resolve(ROOT, "docs/requirements.csv");
if (existsSync(reqPath)) {
  const csv = readFileSync(reqPath, "utf8").trim().split("\n");
  if (csv.length < 10) failures.push(`docs/requirements.csv has only ${csv.length - 1} rows`);
  if (!csv[0].startsWith("id,source,requirement,milestone,status,evidence,notes")) {
    failures.push("docs/requirements.csv header is wrong");
  }
}

for (const note of notes) console.log(`note: ${note}`);

if (failures.length) {
  for (const failure of failures) console.error(`FAIL ${failure}`);
  console.error(`\n${failures.length} check(s) failed`);
  process.exit(1);
}

console.log(`OK ${required.length} required files present, ${tracked.length} tracked files scanned`);
