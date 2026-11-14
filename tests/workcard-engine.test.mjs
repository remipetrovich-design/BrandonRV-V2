import test from "node:test";
import assert from "node:assert/strict";
import {
  buildPlannedWorkEntries,
  getInitialWorkcardState,
  getEnquiryStageForWorkcardStatus
} from "../src/lib/workcard-engine.mjs";

test("accepted quote lines become planned Workcard entries, not used or invoiceable work", () => {
  const entries = buildPlannedWorkEntries([
    { id: "quote-item-labour", description: "Remove and refit trim", quantity: 2, unit_price: 85, tax_rate: 10, item_type: "labour", service_id: "service-1" },
    { id: "quote-item-parts", description: "Replacement trim clips", quantity: 4, unit_price: 3.5, tax_rate: 10, item_type: "parts", service_id: null }
  ], { businessId: "business-1", jobId: "job-1", createdBy: "staff-1" });

  assert.deepEqual(entries.map(entry => ({
    business_id: entry.business_id,
    job_id: entry.job_id,
    created_by: entry.created_by,
    source_quote_item_id: entry.source_quote_item_id,
    entry_type: entry.entry_type,
    quantity: entry.quantity,
    quantity_required: entry.quantity_required,
    quantity_used: entry.quantity_used,
    quantity_ordered: entry.quantity_ordered,
    quantity_received: entry.quantity_received,
    part_order_status: entry.part_order_status,
    line_total: entry.line_total,
    customer_visible: entry.customer_visible,
    invoiceable: entry.invoiceable
  })), [
    {
      business_id: "business-1", job_id: "job-1", created_by: "staff-1",
      source_quote_item_id: "quote-item-labour", entry_type: "labour",
      quantity: 2, quantity_required: 2, quantity_used: 0,
      quantity_ordered: 0, quantity_received: 0, part_order_status: "not_required",
      line_total: 0, customer_visible: false, invoiceable: false
    },
    {
      business_id: "business-1", job_id: "job-1", created_by: "staff-1",
      source_quote_item_id: "quote-item-parts", entry_type: "parts",
      quantity: 4, quantity_required: 4, quantity_used: 0,
      quantity_ordered: 0, quantity_received: 0, part_order_status: "not_ordered",
      line_total: 0, customer_visible: false, invoiceable: false
    }
  ]);
});

test("planned Workcard entries reject invalid quote quantities or line types", () => {
  assert.throws(() => buildPlannedWorkEntries([{ id: "q1", description: "Bad quantity", quantity: 0, item_type: "parts" }], { businessId: "b", jobId: "j", createdBy: "u" }), /quantity/i);
  assert.throws(() => buildPlannedWorkEntries([{ id: "q1", description: "Unknown item", quantity: 1, item_type: "unknown" }], { businessId: "b", jobId: "j", createdBy: "u" }), /labour or parts/i);
});

test("Workcard initial state prioritises parts before booking while retaining a confirmed schedule", () => {
  assert.deepEqual(
    getInitialWorkcardState([{ item_type: "parts" }], "confirmed"),
    { status: "scheduled", bookingConfirmed: true, enquiryStage: "parts_required" }
  );
  assert.deepEqual(
    getInitialWorkcardState([{ item_type: "labour" }], "rescheduled"),
    { status: "scheduled", bookingConfirmed: true, enquiryStage: "booked" }
  );
  assert.deepEqual(
    getInitialWorkcardState([{ item_type: "labour" }], "requested"),
    { status: "pending", bookingConfirmed: false, enquiryStage: "booking_requested" }
  );
  assert.deepEqual(
    getInitialWorkcardState([{ item_type: "labour" }], null),
    { status: "pending", bookingConfirmed: false, enquiryStage: "workcard_created" }
  );
});

test("Workcard status maps to the matching customer Jobcard pipeline stage", () => {
  assert.equal(getEnquiryStageForWorkcardStatus("waiting_parts"), "parts_required");
  assert.equal(getEnquiryStageForWorkcardStatus("scheduled"), "booked");
  assert.equal(getEnquiryStageForWorkcardStatus("in_progress"), "work_in_progress");
  assert.equal(getEnquiryStageForWorkcardStatus("completed"), "quality_check");
  assert.equal(getEnquiryStageForWorkcardStatus("cancelled"), "cancelled");
  assert.equal(getEnquiryStageForWorkcardStatus("pending"), null);
});
