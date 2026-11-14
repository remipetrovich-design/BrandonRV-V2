import test from "node:test";
import assert from "node:assert/strict";
import { buildAuditEvent, writeAuditEvent } from "../src/lib/audit-events.mjs";

const valid = {
  businessId: "11111111-1111-4111-8111-111111111111",
  actorUserId: "22222222-2222-4222-8222-222222222222",
  action: "quote.created",
  entityType: "quote",
  entityId: "33333333-3333-4333-8333-333333333333",
  details: { quote_number: "BRV-Q-001" }
};

test("buildAuditEvent maps domain fields to the existing audit_events schema", () => {
  assert.deepEqual(buildAuditEvent(valid), {
    business_id: valid.businessId,
    actor_user_id: valid.actorUserId,
    action: valid.action,
    entity_type: valid.entityType,
    entity_id: valid.entityId,
    details: valid.details
  });
});

test("buildAuditEvent rejects missing business, action, or entity type", () => {
  assert.throws(() => buildAuditEvent({ ...valid, businessId: "" }), /business/i);
  assert.throws(() => buildAuditEvent({ ...valid, action: " " }), /action/i);
  assert.throws(() => buildAuditEvent({ ...valid, entityType: "" }), /entity type/i);
});

test("buildAuditEvent defaults optional actor, entity ID, and details safely", () => {
  assert.deepEqual(buildAuditEvent({
    businessId: valid.businessId,
    action: "business.updated",
    entityType: "business"
  }), {
    business_id: valid.businessId,
    actor_user_id: null,
    action: "business.updated",
    entity_type: "business",
    entity_id: null,
    details: {}
  });
});

test("buildAuditEvent rejects non-object and oversized details", () => {
  assert.throws(() => buildAuditEvent({ ...valid, details: [] }), /details/i);
  assert.throws(() => buildAuditEvent({ ...valid, details: { payload: "x".repeat(40000) } }), /size/i);
});

test("writeAuditEvent inserts into audit_events and propagates database errors", async () => {
  let inserted;
  const db = {
    from(table) {
      assert.equal(table, "audit_events");
      return { insert: async row => { inserted = row; return { error: null }; } };
    }
  };
  await writeAuditEvent(db, valid);
  assert.deepEqual(inserted, buildAuditEvent(valid));

  const failingDb = { from: () => ({ insert: async () => ({ error: new Error("database unavailable") }) }) };
  await assert.rejects(writeAuditEvent(failingDb, valid), error => {
    assert.equal(error.message, "Could not write audit event.");
    assert.equal(error.cause?.message, "database unavailable");
    return true;
  });
});
