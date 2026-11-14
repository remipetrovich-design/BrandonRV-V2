import test from "node:test";
import assert from "node:assert/strict";
import {
  prepareQuoteLines,
  validateQuoteTaxPolicy,
  nextQuoteRevision
} from "../src/lib/quote-engine.mjs";

test("prepares itemised labour and parts quote lines with shared money totals", () => {
  const quote = prepareQuoteLines([
    { description: "Remove and refit trim", quantity: 2, unitPrice: 85, itemType: "labour" },
    { description: "Replacement trim clips", quantity: 4, unitPrice: 3.5, itemType: "parts" }
  ], 10);

  assert.deepEqual(quote.lines.map(line => ({
    description: line.description,
    quantity: line.quantity,
    unit_price: line.unit_price,
    tax_rate: line.tax_rate,
    line_total: line.line_total,
    item_type: line.item_type
  })), [
    { description: "Remove and refit trim", quantity: 2, unit_price: 85, tax_rate: 10, line_total: 170, item_type: "labour" },
    { description: "Replacement trim clips", quantity: 4, unit_price: 3.5, tax_rate: 10, line_total: 14, item_type: "parts" }
  ]);
  assert.equal(quote.subtotal, 184);
  assert.equal(quote.taxAmount, 18.4);
  assert.equal(quote.total, 202.4);
  assert.deepEqual(Object.keys(quote.lines[0]).sort(), [
    "description", "item_type", "line_total", "quantity", "service_id", "sort_order", "tax_rate", "unit_price"
  ].sort(), "Only database quote-item fields should be returned from the quote engine.");
});

test("rejects invalid quote lines and service presets on parts", () => {
  assert.throws(() => prepareQuoteLines([], 0), /between 1 and 30/i);
  assert.throws(() => prepareQuoteLines([{ description: "x", quantity: 1, unitPrice: 10 }], 0), /description/i);
  assert.throws(() => prepareQuoteLines([{ description: "Part", quantity: 0, unitPrice: 10 }], 0), /quantity/i);
  assert.throws(() => prepareQuoteLines([{ description: "Part", quantity: 1, unitPrice: 10, serviceId: "service-1", itemType: "parts" }], 0), /labour/i);
});

test("GST is only allowed when the business is configured as registered and the rate matches", () => {
  assert.throws(() => validateQuoteTaxPolicy([10], { gst_status: "not_configured", gst_rate: 10 }), /GST cannot be added/i);
  assert.throws(() => validateQuoteTaxPolicy([10], { gst_status: "registered", gst_rate: 5 }), /configured GST rate/i);
  assert.deepEqual(
    validateQuoteTaxPolicy([10, 10], { gst_status: "registered", gst_rate: 10 }),
    { gstStatus: "registered", configuredGstRate: 10 }
  );
  assert.deepEqual(
    validateQuoteTaxPolicy([0], { gst_status: "not_configured", gst_rate: 10 }),
    { gstStatus: "not_configured", configuredGstRate: 10 }
  );
});

test("quote revisions stay with the same customer and Jobcard and cannot revise accepted quotes", () => {
  const prior = { enquiry_id: "enquiry-1", customer_id: "customer-1", revision_number: 2, status: "sent" };
  assert.equal(nextQuoteRevision(prior, { enquiryId: "enquiry-1", customerId: "customer-1" }), 3);
  assert.throws(() => nextQuoteRevision(prior, { enquiryId: "enquiry-2", customerId: "customer-1" }), /same customer and Jobcard/i);
  assert.throws(() => nextQuoteRevision({ ...prior, status: "accepted" }, { enquiryId: "enquiry-1", customerId: "customer-1" }), /accepted quote cannot be revised/i);
});
