import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const diagnostic = await readFile(new URL("../scripts/diagnose-migration-history.mjs", import.meta.url), "utf8");
const workflow = await readFile(new URL("../.github/workflows/reconcile-migration-history.yml", import.meta.url), "utf8");

test("migration diagnostic identifies remote-only versions and exits without mutating history",()=>{
 assert.match(diagnostic,/remoteVersions/);
 assert.match(diagnostic,/remoteOnly/);
 assert.match(diagnostic,/No migrations were applied or history records changed/);
 assert.doesNotMatch(diagnostic,/supabase db push|migration repair|reset/);
});
test("reconciliation workflow is explicitly confirmed and read-only",()=>{
 assert.match(workflow,/confirm == 'CHECK'/);
 assert.match(workflow,/diagnose-migration-history\.mjs/);
 assert.doesNotMatch(workflow,/supabase db push|migration repair|reset/);
});
