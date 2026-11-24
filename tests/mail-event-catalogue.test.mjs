import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const catalogue = await readFile(new URL("../src/lib/integration-events.ts", import.meta.url), "utf8");
const manifest = JSON.parse(await readFile(new URL("../integrations/Mail-system/integration.json", import.meta.url), "utf8"));
const requiredEvents = [
  "account.password_reset_requested", "account.password_changed", "account.invitation_created",
  "staff.invitation_created", "customer.account_created", "enquiry.received",
  "quote.issued", "quote.accepted", "quote.declined", "quote.changes_requested",
  "booking.requested", "booking.confirmed", "booking.rescheduled", "booking.cancelled",
  "job.assigned", "job.started", "job.completed", "job.customer_approval_requested",
  "job.customer_approved", "job.customer_changes_requested", "invoice.issued",
  "payment.received", "payment.refunded", "invoice.credit_issued",
  "supplier_order.placed", "supplier_order.delayed", "review.requested",
];
test("Mail System subscribes to every Brandon RV notification event", () => {
  for (const event of requiredEvents) {
    assert.ok(catalogue.includes('"' + event + '"'), "Missing event contract " + event);
    assert.ok(manifest.events.includes(event), "Mail System is not subscribed to " + event);
  }
});
test("Mail System uses a dedicated server-side External System key", () => {
  assert.equal(manifest.config.length, 1);
  assert.equal(manifest.config[0].key, "apiKey");
  assert.equal(manifest.config[0].type, "secret");
  assert.equal(manifest.config[0].required, true);
});
