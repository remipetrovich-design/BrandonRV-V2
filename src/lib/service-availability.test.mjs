import test from "node:test";
import assert from "node:assert/strict";
import { isServiceAvailableForQuoting } from "./service-availability.mjs";

test("only active services approved for launch can be used in quotes", () => {
  assert.equal(isServiceAvailableForQuoting({ approval_status: "approved_for_launch", is_active: true }), true);
  for (const approval_status of ["conditional", "assessment_required", "deferred", "not_offered"]) {
    assert.equal(isServiceAvailableForQuoting({ approval_status, is_active: true }), false, approval_status);
  }
  assert.equal(isServiceAvailableForQuoting({ approval_status: "approved_for_launch", is_active: false }), false);
  assert.equal(isServiceAvailableForQuoting(null), false);
});
