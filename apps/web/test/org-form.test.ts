/**
 * The profile form's rules: only changed fields are sent, empty optional text becomes
 * null, and an address-shaped email is refused before a request.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { diffPatch, isDirty, toFormValues, validateForm, type OrgFormValues } from "../src/lib/orgForm.ts";
import type { OrgSettings } from "../src/lib/api.ts";

const ORG: OrgSettings = {
  legalName: "Mooral Traders",
  bin: "000000000-0101",
  address: "House 12, Dhanmondi",
  phone: null,
  email: "accounts@mooral.test",
  currency: "BDT",
  timezone: "Asia/Dhaka",
  numberingSystem: "bengali",
  fiscalYearStartMonth: 7,
  vatRegistered: false,
  updatedAt: "2026-11-21T10:00:00.000Z",
};

const BASE: OrgFormValues = toFormValues(ORG);

test("null columns become empty inputs", () => {
  assert.equal(BASE.phone, "");
  assert.equal(BASE.legalName, "Mooral Traders");
});

test("an unchanged form produces an empty patch", () => {
  assert.deepEqual(diffPatch(BASE, { ...BASE }), {});
  assert.equal(isDirty(BASE, { ...BASE }), false);
  assert.equal(isDirty(BASE, { ...BASE, legalName: "Mooral Traders " }), false, "trim is ignored");
});

test("only changed fields are sent, trimmed, with empty text as null", () => {
  const patch = diffPatch(BASE, {
    ...BASE,
    legalName: "  Mooral Traders Ltd  ",
    phone: "  +880 1711 000000 ",
    email: "   ",
    vatRegistered: true,
  });

  assert.deepEqual(patch, {
    legalName: "Mooral Traders Ltd",
    phone: "+880 1711 000000",
    email: null,
    vatRegistered: true,
  });
});

test("select and checkbox changes are included", () => {
  const patch = diffPatch(BASE, {
    ...BASE,
    numberingSystem: "latin",
    fiscalYearStartMonth: 1,
  });
  assert.deepEqual(patch, { numberingSystem: "latin", fiscalYearStartMonth: 1 });
});

test("email validation accepts empty and well-formed, rejects the rest", () => {
  const messages = { emailInvalid: "bad email" };
  assert.deepEqual(validateForm({ ...BASE, email: "" }, messages), {});
  assert.deepEqual(validateForm({ ...BASE, email: "a@b.test" }, messages), {});
  assert.deepEqual(validateForm({ ...BASE, email: "not-an-address" }, messages), {
    email: "bad email",
  });
  assert.deepEqual(validateForm({ ...BASE, email: "a@b" }, messages), { email: "bad email" });
});
