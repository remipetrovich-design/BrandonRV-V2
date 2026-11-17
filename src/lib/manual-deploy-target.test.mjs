import test from "node:test";
import assert from "node:assert/strict";
import { resolveManualDeployTarget } from "./manual-deploy-target.mjs";

const valid = {
  BRANDON_RV_MANUAL_DEPLOY_ENABLED: "true",
  NEXT_PUBLIC_SUPABASE_URL: "https://lciylmfpcefdpsouoqvm.supabase.co",
  POSTGRES_URL_NON_POOLING: "postgresql://postgres:encoded-password@db.lciylmfpcefdpsouoqvm.supabase.co:5432/postgres",
};

test("manual migration target requires the Vercel activation gate", () => {
  assert.throws(() => resolveManualDeployTarget({ ...valid, BRANDON_RV_MANUAL_DEPLOY_ENABLED: "false" }, "lciylmfpcefdpsouoqvm"), /disabled/);
});

test("manual migration target rejects a different Supabase project", () => {
  assert.throws(() => resolveManualDeployTarget({ ...valid, NEXT_PUBLIC_SUPABASE_URL: "https://old-project.supabase.co" }, "lciylmfpcefdpsouoqvm"), /does not match/);
});

test("manual migration target requires the Vercel integration direct database URL", () => {
  assert.throws(() => resolveManualDeployTarget({ ...valid, POSTGRES_URL_NON_POOLING: "" }, "lciylmfpcefdpsouoqvm"), /POSTGRES_URL_NON_POOLING/);
});

test("manual migration target returns only the V2 direct database URL", () => {
  assert.equal(resolveManualDeployTarget(valid, "lciylmfpcefdpsouoqvm"), valid.POSTGRES_URL_NON_POOLING);
});
