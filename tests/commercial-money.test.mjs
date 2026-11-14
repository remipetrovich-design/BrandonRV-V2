import test from "node:test";
import assert from "node:assert/strict";
import { calculateDocumentTotals, priceDocumentLines } from "../src/lib/commercial-money.mjs";

test("prices quote lines in cents and returns stable document totals", () => {
  const priced = priceDocumentLines([
    { description: "Labour", quantity: 1.5, unit_price: 100, tax_rate: 10 },
    { description: "Part", quantity: 2, unit_price: 12.35, tax_rate: 10 }
  ]);

  assert.deepEqual(priced, {
    lines: [
      { description: "Labour", quantity: 1.5, unit_price: 100, tax_rate: 10, line_total: 150 },
      { description: "Part", quantity: 2, unit_price: 12.35, tax_rate: 10, line_total: 24.7 }
    ],
    subtotal: 174.7,
    taxAmount: 17.47,
    total: 192.17
  });
});

test("rounds half-cent line amounts consistently before calculating tax", () => {
  const priced = priceDocumentLines([
    { quantity: 1, unit_price: 0.105, tax_rate: 10 },
    { quantity: 1, unit_price: 0.105, tax_rate: 10 }
  ]);

  assert.equal(priced.subtotal, 0.22);
  assert.equal(priced.taxAmount, 0.02);
  assert.equal(priced.total, 0.24);
});

test("supports mixed tax rates without applying GST to non-taxable lines", () => {
  const totals = calculateDocumentTotals([
    { line_total: 100, tax_rate: 10 },
    { line_total: 50, tax_rate: 0 },
    { line_total: 20, tax_rate: 5 }
  ]);

  assert.deepEqual(totals, { subtotal: 170, taxAmount: 11, total: 181 });
});

test("rejects invalid quantities, prices and tax rates", () => {
  assert.throws(() => priceDocumentLines([{ quantity: 0, unit_price: 10, tax_rate: 10 }]), /quantity/i);
  assert.throws(() => priceDocumentLines([{ quantity: 1, unit_price: -1, tax_rate: 10 }]), /price/i);
  assert.throws(() => priceDocumentLines([{ quantity: 1, unit_price: 10, tax_rate: 101 }]), /tax/i);
});

test("rejects non-finite monetary inputs instead of silently converting them to zero", () => {
  assert.throws(() => calculateDocumentTotals([{ line_total: Number.NaN, tax_rate: 10 }]), /finite/i);
});
