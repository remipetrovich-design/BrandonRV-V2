import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const catalogue = await readFile(new URL("../src/lib/integration-events.ts", import.meta.url), "utf8");
const manifest = JSON.parse(await readFile(new URL("../integrations/Mail-system/integration.json", import.meta.url), "utf8"));
const requiredEvents = [
  "account.password_reset_requested", "account.password_changed", "staff.invitation_created",
  "customer.account_created", "enquiry.received", "quote.issued", "quote.accepted", "quote.declined",
  "quote.changes_requested", "booking.requested", "booking.confirmed", "booking.rescheduled",
  "booking.cancelled", "job.assigned", "job.started", "job.completed",
  "job.customer_approval_requested", "job.customer_approved", "job.customer_changes_requested",
  "invoice.issued", "payment.received", "payment.refunded", "invoice.credit_issued",
];
test("Mail System subscribes to every Brandon RV business event that is currently emitted", () => {
  assert.deepEqual([...manifest.events].sort(), [...requiredEvents].sort());
  for (const event of requiredEvents) assert.ok(catalogue.includes('"' + event + '"'), "Missing event contract " + event);
});
test("Mail System uses a dedicated server-side External System key", () => {
  assert.equal(manifest.config.length, 1);
  assert.equal(manifest.config[0].key, "apiKey");
  assert.equal(manifest.config[0].type, "secret");
  assert.equal(manifest.config[0].required, true);
});
