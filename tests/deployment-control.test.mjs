import test from "node:test";
import assert from "node:assert/strict";
import { isManualDeployAvailable } from "../src/lib/deployment-control.mjs";

test("manual deployment is dormant when the activation flag is absent", () => {
  assert.deepEqual(isManualDeployAvailable({ dispatchToken: "configured" }), {
    activated: false, configured: true, available: false
  });
});

test("manual deployment remains dormant unless explicitly activated", () => {
  assert.deepEqual(isManualDeployAvailable({ enabledFlag: "false", dispatchToken: "configured" }), {
    activated: false, configured: true, available: false
  });
});

test("manual deployment cannot be triggered without the GitHub dispatch token", () => {
  assert.deepEqual(isManualDeployAvailable({ enabledFlag: "true", dispatchToken: "" }), {
    activated: true, configured: false, available: false
  });
});

test("manual deployment becomes available only when both gates are configured", () => {
  assert.deepEqual(isManualDeployAvailable({ enabledFlag: " TRUE ", dispatchToken: " token " }), {
    activated: true, configured: true, available: true
  });
});
