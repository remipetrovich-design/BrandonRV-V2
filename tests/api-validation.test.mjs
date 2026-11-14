import test from "node:test";
import assert from "node:assert/strict";
import {
  isUuid,
  isCalendarDate,
  isPlainObject,
  readTrimmedString,
  readFiniteNumber
} from "../src/lib/api-validation.mjs";

test("UUID validation accepts canonical UUIDs and rejects malformed identifiers", () => {
  assert.equal(isUuid("b2e1b3a7-3d52-4e47-9a3d-4a2e4b8e2f01"), true);
  assert.equal(isUuid("b2e1b3a7-3d52-4e47-9a3d-4a2e4b8e2f0"), false);
  assert.equal(isUuid("not-a-uuid"), false);
  assert.equal(isUuid(null), false);
});

test("calendar date validation rejects impossible dates rather than normalising them", () => {
  assert.equal(isCalendarDate("2026-11-15"), true);
  assert.equal(isCalendarDate("2026-02-29"), false);
  assert.equal(isCalendarDate("2024-02-29"), true);
  assert.equal(isCalendarDate("15-11-2026"), false);
  assert.equal(isCalendarDate(new Date()), false);
});

test("plain object validation rejects arrays and class instances", () => {
  assert.equal(isPlainObject({ value: 1 }), true);
  assert.equal(isPlainObject(Object.create(null)), true);
  assert.equal(isPlainObject([]), false);
  assert.equal(isPlainObject(new Date()), false);
  assert.equal(isPlainObject(null), false);
});

test("trimmed string validation trims and enforces bounds", () => {
  assert.equal(readTrimmedString("  Chris  ", { min: 2, max: 20, label: "Name" }), "Chris");
  assert.equal(readTrimmedString("  ", { optional: true, label: "Name" }), null);
  assert.throws(() => readTrimmedString("x", { min: 2, max: 20, label: "Name" }), /between 2 and 20/);
  assert.throws(() => readTrimmedString(123, { label: "Name" }), /must be text/);
});

test("finite number validation accepts form strings and enforces numeric bounds", () => {
  assert.equal(readFiniteNumber("12.5", { min: 0, max: 20, label: "Rate" }), 12.5);
  assert.equal(readFiniteNumber("", { optional: true, label: "Rate" }), null);
  assert.throws(() => readFiniteNumber("NaN", { min: 0, max: 20, label: "Rate" }), /finite number/);
  assert.throws(() => readFiniteNumber("21", { min: 0, max: 20, label: "Rate" }), /between 0 and 20/);
});
