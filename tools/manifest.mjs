#!/usr/bin/env node
/**
 * tools/manifest.mjs — generate a deterministic file manifest of a git ref.
 *
 * Spec reference: MBS master prompt 0.1 "Manifest before/after".
 * Produces one CSV row per tracked file: relative path, type, mode, size,
 * git blob SHA, and SHA-256 of the blob content. Nothing is excluded.
 *
 * Usage:
 *   node tools/manifest.mjs --repo ../old-src --ref <sha|HEAD> --out docs/audit/old-manifest-before.csv
 *
 * Read-only: it never writes inside the target repository.
 */
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

function flag(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const repo = resolve(flag("repo", "../old-src"));
const ref = flag("ref", "HEAD");
const out = resolve(flag("out", "docs/audit/old-manifest.csv"));

const git = (...args) =>
  execFileSync("git", ["-C", repo, ...args], { maxBuffer: 1024 * 1024 * 512 });

const sha = git("rev-parse", ref).toString("utf8").trim();
const listing = git("ls-tree", "-r", "-l", sha).toString("utf8").split("\n").filter(Boolean);

function csvCell(value) {
  const s = String(value ?? "");
  return /[",\n\r]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
}

const rows = [];
let totalBytes = 0;

for (const line of listing) {
  const tab = line.indexOf("\t");
  if (tab < 0) continue;
  const meta = line.slice(0, tab).trim().split(/\s+/);
  const [mode, type, blob, sizeField] = meta;
  const path = line.slice(tab + 1);

  let sha256 = "";
  if (type === "blob") {
    const content = git("cat-file", "blob", blob);
    sha256 = createHash("sha256").update(content).digest("hex");
  }

  const size = sizeField === "-" ? "" : sizeField;
  if (size !== "") totalBytes += Number(size);
  rows.push([path, type, mode, size, blob, sha256].map(csvCell).join(","));
}

const header = "path,type,mode,size_bytes,git_blob_sha,sha256";
const body = [header, ...rows].join("\n") + "\n";

mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, body, { encoding: "utf8" });

const manifestSha = createHash("sha256").update(body).digest("hex");
console.log(`ref=${sha}`);
console.log(`files=${rows.length}`);
console.log(`total_bytes=${totalBytes}`);
console.log(`manifest_sha256=${manifestSha}`);
console.log(`written=${out}`);
