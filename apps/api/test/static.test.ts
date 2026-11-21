/**
 * Static serving for the owner portal: `/` and deep links return the app, `/api/` stays
 * with the API, and a path that escapes the build directory is refused.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AddressInfo } from "node:net";
import { createApiServer } from "../src/http.ts";

let root = "";
let outside = "";
let server: ReturnType<typeof createApiServer>;
let base = "";

before(async () => {
  root = await mkdtemp(join(tmpdir(), "mbs-web-"));
  outside = await mkdtemp(join(tmpdir(), "mbs-secret-"));
  await mkdir(join(root, "assets"), { recursive: true });
  await writeFile(join(root, "index.html"), "<!doctype html><title>MBS portal</title>");
  await writeFile(join(root, "assets", "app-abc123.js"), "console.log('portal');");
  await writeFile(join(outside, "secret.txt"), "not for you");

  const db = {
    query: () => {
      throw new Error("static requests must not touch the database");
    },
  };
  server = createApiServer({ db: db as never, secureCookies: false, webRoot: root });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

after(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await rm(root, { recursive: true, force: true });
  await rm(outside, { recursive: true, force: true });
});

test("the root and a deep link both load the app shell", async () => {
  for (const path of ["/", "/profile"]) {
    const response = await fetch(`${base}${path}`);
    assert.equal(response.status, 200, path);
    assert.equal(response.headers.get("content-type"), "text/html; charset=utf-8");
    assert.match(await response.text(), /MBS portal/);
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.match(response.headers.get("content-security-policy") ?? "", /default-src 'self'/);
  }
});

test("hashed assets are served with their type and a long cache", async () => {
  const response = await fetch(`${base}/assets/app-abc123.js`);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("content-type"), "text/javascript; charset=utf-8");
  assert.equal(response.headers.get("cache-control"), "public, max-age=31536000, immutable");
  assert.equal(await response.text(), "console.log('portal');");
});

test("a traversal attempt is refused", async () => {
  const response = await fetch(`${base}/%2e%2e/${encodeURIComponent(outside.split("/").pop() ?? "")}/secret.txt`);
  assert.equal(response.status, 404);
  assert.doesNotMatch(await response.text(), /not for you/);
});

test("API routes are never handled as files", async () => {
  const health = await fetch(`${base}/api/v1/health`);
  assert.equal(health.status, 200);
  assert.deepEqual(await health.json(), { status: "ok" });

  const missing = await fetch(`${base}/api/v1/nope`);
  assert.equal(missing.status, 404);
  assert.equal((await missing.json()).error.code, "not_found");
});

test("a missing asset is a 404, not the app shell", async () => {
  const response = await fetch(`${base}/assets/missing.js`);
  assert.equal(response.status, 404);
});
