import test from "node:test";
import assert from "node:assert/strict";
import { isManualOperationDisabled } from "../src/lib/deployment-control.mjs";

test("manual workflow buttons stay enabled when direct dispatch is unavailable", () => {
  assert.equal(isManualOperationDisabled({ busy: "" }), false);
  assert.equal(isManualOperationDisabled({ busy: null }), false);
});

test("manual workflow buttons disable only while an operation is being queued", () => {
  assert.equal(isManualOperationDisabled({ busy: "deploy" }), true);
  assert.equal(isManualOperationDisabled({ busy: "scan_apply" }), true);
});
