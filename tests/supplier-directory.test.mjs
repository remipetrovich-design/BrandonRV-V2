import test from "node:test";
import assert from "node:assert/strict";
import { normalizeSupplierInput } from "../src/lib/supplier-directory.mjs";

test("supplier input trims optional contact fields and normalises email", () => {
  assert.deepEqual(normalizeSupplierInput({
    name: "  Example Parts  ",
    contact_name: "  Casey  ",
    email: " SALES@EXAMPLE.COM ",
    phone: " 02 6000 0000 ",
    account_reference: " AC-12 ",
    website: " https://example.com ",
    notes: " Preferred contact by email ",
    is_active: true
  }), {
    name: "Example Parts",
    contact_name: "Casey",
    email: "sales@example.com",
    phone: "02 6000 0000",
    account_reference: "AC-12",
    website: "https://example.com/",
    notes: "Preferred contact by email",
    is_active: true
  });
});

test("supplier name is required and length-limited", () => {
  assert.throws(() => normalizeSupplierInput({ name: " " }), /supplier name/i);
  assert.throws(() => normalizeSupplierInput({ name: "x".repeat(161) }), /supplier name/i);
});

test("supplier email and website must be valid when supplied", () => {
  assert.throws(() => normalizeSupplierInput({ name: "Parts", email: "bad" }), /email/i);
  assert.throws(() => normalizeSupplierInput({ name: "Parts", website: "javascript:alert(1)" }), /website/i);
});

test("supplier active state must be boolean when supplied", () => {
  assert.throws(() => normalizeSupplierInput({ name: "Parts", is_active: "true" }), /active/i);
});

test("supplier input rejects unknown fields so API clients cannot write arbitrary columns", () => {
  assert.throws(() => normalizeSupplierInput({ name: "Parts", business_id: "attacker-controlled" }), /field/i);
});
