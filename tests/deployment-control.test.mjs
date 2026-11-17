import test from "node:test";
import assert from "node:assert/strict";
import { isManualDeployAvailable } from "../src/lib/deployment-control.mjs";

test("manual deployment is available when the direct dispatch token is absent", () => {
  assert.deepEqual(isManualDeployAvailable({}), { configured: false, available: true });
});

test("manual deployment is available regardless of the legacy activation flag", () => {
  assert.deepEqual(isManualDeployAvailable({ enabledFlag: "false", dispatchToken: "configured" }), { configured: true, available: true });
});

test("direct dispatch is marked configured only when a token is present", () => {
  assert.deepEqual(isManualDeployAvailable({ dispatchToken: "  " }), { configured: false, available: true });
  assert.deepEqual(isManualDeployAvailable({ dispatchToken: " token " }), { configured: true, available: true });
});
