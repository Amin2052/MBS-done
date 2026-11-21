/**
 * The router contract (ADR-0018). Pure functions only: the History API lives in the hook,
 * which the browser exercises, while the decisions a link makes are tested here.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { normalisePath, resolveRoute, shouldNavigate, type ClickLike } from "../src/lib/router.ts";
import { NAV_ITEMS } from "../src/lib/nav.ts";

const plainClick: ClickLike = {
  button: 0,
  metaKey: false,
  ctrlKey: false,
  shiftKey: false,
  altKey: false,
  defaultPrevented: false,
};

test("paths resolve to the screens that exist", () => {
  assert.deepEqual(resolveRoute("/"), { id: "dashboard", path: "/" });
  assert.deepEqual(resolveRoute(""), { id: "dashboard", path: "/" });
  assert.deepEqual(resolveRoute("/profile"), { id: "profile", path: "/profile" });
  assert.deepEqual(resolveRoute("/profile/"), { id: "profile", path: "/profile" });
  assert.deepEqual(resolveRoute("/customers"), { id: "notFound", path: "/customers" });
});

test("paths are normalised but never case-folded", () => {
  assert.equal(normalisePath("/"), "/");
  assert.equal(normalisePath("///"), "/");
  assert.equal(normalisePath("/profile///"), "/profile");
  assert.equal(normalisePath("/Profile"), "/Profile");
  assert.equal(resolveRoute("/Profile").id, "notFound");
});

test("a plain internal click is taken over", () => {
  const origin = "http://portal.test";
  assert.equal(shouldNavigate(plainClick, "/profile", origin), true);
  assert.equal(shouldNavigate(plainClick, "http://portal.test/profile", origin), true);
  assert.equal(shouldNavigate(plainClick, "/", origin), true);
});

test("modifier keys, other buttons, external hosts and odd schemes are left alone", () => {
  const origin = "http://portal.test";
  for (const modifier of ["metaKey", "ctrlKey", "shiftKey", "altKey"] as const) {
    assert.equal(shouldNavigate({ ...plainClick, [modifier]: true }, "/profile", origin), false);
  }
  assert.equal(shouldNavigate({ ...plainClick, button: 1 }, "/profile", origin), false);
  assert.equal(shouldNavigate({ ...plainClick, defaultPrevented: true }, "/profile", origin), false);
  assert.equal(shouldNavigate(plainClick, "https://evil.test/profile", origin), false);
  assert.equal(shouldNavigate(plainClick, "//evil.test/profile", origin), false);
  assert.equal(shouldNavigate(plainClick, "javascript:alert(1)", origin), false);
  assert.equal(shouldNavigate(plainClick, "data:text/html,hi", origin), false);
});

test("every menu entry points at a real screen", () => {
  for (const item of NAV_ITEMS) {
    const route = resolveRoute(item.path);
    assert.notEqual(route.id, "notFound", `${item.id} points at ${item.path}`);
    assert.equal(route.path, item.path);
  }
  assert.equal(new Set(NAV_ITEMS.map((item) => item.path)).size, NAV_ITEMS.length);
});
