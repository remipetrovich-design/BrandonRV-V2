import test from "node:test";
import assert from "node:assert/strict";
import { resolveSupabaseMigrationTarget } from "../src/lib/supabase-migration-target.mjs";

const validEnv = {
  SUPABASE_PROJECT_ID: "lciylmfpcefdpsouoqvm",
  SUPABASE_ACCESS_TOKEN: "test-access-token",
  SUPABASE_DB_PASSWORD: "test-db-password",
};

test("migration target accepts only the dedicated Brandon RV V2 project", () => {
  assert.equal(resolveSupabaseMigrationTarget(validEnv), "lciylmfpcefdpsouoqvm");
  assert.throws(
    () => resolveSupabaseMigrationTarget({ ...validEnv, SUPABASE_PROJECT_ID: "another-project" }),
    /dedicated Brandon RV V2 Supabase project/,
  );
});

test("migration target requires direct Supabase credentials", () => {
  assert.throws(
    () => resolveSupabaseMigrationTarget({ ...validEnv, SUPABASE_ACCESS_TOKEN: "" }),
    /SUPABASE_ACCESS_TOKEN/,
  );
  assert.throws(
    () => resolveSupabaseMigrationTarget({ ...validEnv, SUPABASE_DB_PASSWORD: "" }),
    /SUPABASE_DB_PASSWORD/,
  );
});
