#!/usr/bin/env node
/**
 * tools/guard.mjs — write guard for the NEW repository.
 *
 * Spec reference: MBS master prompt 0.1 "Write guard".
 * Resolves a target path and refuses anything outside the NEW root, and
 * refuses the NEW root itself for destructive operations.
 *
 * Usage:
 *   node tools/guard.mjs <path>            # check only
 *   node tools/guard.mjs --root <path>     # also refuse the NEW root itself
 *
 * Exit codes: 0 = allowed, 1 = refused (outside NEW), 2 = refused (is NEW root),
 *             3 = usage error.
 */
import { realpathSync, existsSync } from "node:fs";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

export const NEW_ROOT = realpathSync.native(resolve(dirname(fileURLToPath(import.meta.url)), ".."));

function realpathLoose(target) {
  // Resolve symlinks on the deepest existing ancestor, then re-append the rest,
  // so a not-yet-created path can still be checked.
  let current = target;
  const tail = [];
  while (!existsSync(current)) {
    const parent = dirname(current);
    if (parent === current) break;
    tail.unshift(relative(parent, current));
    current = parent;
  }
  const real = realpathSync.native(current);
  return resolve(real, ...tail);
}

export function insideNew(target) {
  const abs = realpathLoose(isAbsolute(target) ? target : resolve(process.cwd(), target));
  const rel = relative(NEW_ROOT, abs);
  const inside = rel === "" || (!rel.startsWith("..") && !rel.startsWith(sep) && !isAbsolute(rel));
  return { abs, rel, inside, isRoot: rel === "" };
}

export function assertInsideNew(target, { allowRoot = true } = {}) {
  const result = insideNew(target);
  if (!result.inside) {
    throw new Error(`refused: ${result.abs} is outside NEW root ${NEW_ROOT}`);
  }
  if (!allowRoot && result.isRoot) {
    throw new Error(`refused: ${result.abs} is the NEW root itself`);
  }
  return result;
}

if (process.argv[1] && realpathSync.native(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const allowRoot = !args.includes("--root");
  const target = args.find((a) => a !== "--root");
  if (!target) {
    console.error("usage: node tools/guard.mjs [--root] <path>");
    process.exit(3);
  }
  const result = insideNew(target);
  if (!result.inside) {
    console.error(`REFUSED outside NEW: ${result.abs}`);
    process.exit(1);
  }
  if (!allowRoot && result.isRoot) {
    console.error(`REFUSED is NEW root: ${result.abs}`);
    process.exit(2);
  }
  console.log(`OK ${result.rel || "."}`);
}
