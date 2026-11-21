import { test } from "node:test";
import assert from "node:assert/strict";
import {
  MoneyError,
  addMoney,
  compareMoney,
  formatMoney,
  groupDigits,
  multiplyMoney,
  parseMoney,
  percentOf,
  subtractMoney,
  sumMoney,
  toDisplayString,
  toStorageString,
} from "../src/money.ts";

test("parseMoney rejects non-strings and malformed values", () => {
  assert.throws(() => parseMoney(10 as unknown as string), MoneyError);
  assert.throws(() => parseMoney("1e5"), MoneyError);
  assert.throws(() => parseMoney("1,234.00"), MoneyError);
  assert.throws(() => parseMoney("abc"), MoneyError);
  assert.throws(() => parseMoney(""), MoneyError);
  assert.equal(parseMoney("0.10").toString(), "0.1");
});

test("storage strings keep four decimals and never use exponent form", () => {
  assert.equal(toStorageString("1"), "1.0000");
  assert.equal(toStorageString("1250.5"), "1250.5000");
  // Input with more precision than we store is a caller bug, not something to round away.
  assert.throws(() => toStorageString("0.0000001"), MoneyError);
  assert.equal(toStorageString("1234567890123.4567"), "1234567890123.4567");
});

test("display strings round half-up to two decimals", () => {
  assert.equal(toDisplayString("10.005"), "10.01");
  assert.equal(toDisplayString("10.004"), "10.00");
  assert.equal(toDisplayString("-10.005"), "-10.01");
});

test("0.1 + 0.2 is exactly 0.3, which floats cannot do", () => {
  assert.equal(addMoney("0.1", "0.2"), "0.3000");
  assert.notEqual(String(0.1 + 0.2), "0.3");
});

test("subtraction, multiplication and percentages stay exact", () => {
  assert.equal(subtractMoney("100.00", "33.33"), "66.6700");
  assert.equal(multiplyMoney("1250.5000", "3"), "3751.5000");
  assert.equal(percentOf("1000", "15"), "150.0000");
  assert.equal(percentOf("999.99", "7.5"), "74.9993");
});

test("sumMoney is exact over many lines", () => {
  assert.equal(sumMoney(["0.1", "0.2", "0.3", "0.4"]), "1.0000");
  assert.equal(sumMoney([]), "0.0000");
});

test("comparison is decimal, not lexicographic", () => {
  assert.equal(compareMoney("9.00", "10.00"), -1);
  assert.equal(compareMoney("10.0000", "10"), 0);
  assert.equal(compareMoney("10.01", "10.0099"), 1);
});

test("grouping follows the lakh/crore convention", () => {
  assert.equal(groupDigits("1234.50"), "1,234.50");
  assert.equal(groupDigits("123456.78"), "1,23,456.78");
  assert.equal(groupDigits("12345678.90"), "1,23,45,678.90");
  assert.equal(groupDigits("999"), "999");
  assert.equal(groupDigits("-12345678.90"), "-1,23,45,678.90");
});

test("formatMoney renders Bangla numerals and the taka sign", () => {
  assert.equal(formatMoney("1250.5"), "৳1,250.50");
  assert.equal(formatMoney("1250.5", { digits: "bengali" }), "৳১,২৫০.৫০");
  assert.equal(formatMoney("1250.5", { symbol: false }), "1,250.50");
  assert.equal(formatMoney("12345678.9", { digits: "bengali" }), "৳১,২৩,৪৫,৬৭৮.৯০");
});

test("amounts beyond numeric(19,4) are rejected at parse time", () => {
  assert.throws(() => parseMoney("12345678901234567"), MoneyError);
});
