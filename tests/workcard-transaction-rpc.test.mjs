import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = path => readFile(new URL(path, import.meta.url), "utf8");

test("admin Workcard updates use one transactional RPC for Workcard, Jobcard stage history and audit", async () => {
  const route = await read("../src/app/api/admin/jobs/[id]/route.ts");
  const migration = await read("../supabase/migrations/20261115123000_update_workcard_with_jobcard_stage_rpc.sql");

  const patch = route.slice(route.indexOf("export async function PATCH"), route.indexOf("export async function DELETE"));
  assert.ok(patch.includes('rpc("update_workcard_with_jobcard_stage"'), "The route must use the transactional update RPC.");
  assert.ok(!patch.includes('.from("jobs").update('), "The route must not update the Workcard outside the transaction.");
  assert.ok(!patch.includes('.from("enquiries").update('), "The route must not update the Jobcard pipeline separately.");
  assert.ok(!patch.includes('.from("enquiry_stage_history").insert('), "Stage history must be written in the same transaction.");
  assert.ok(!patch.includes('.from("audit_events").insert('), "The audit event must be written in the same transaction.");

  for (const token of [
    "FOR UPDATE",
    "jsonb_populate_record",
    "UPDATE public.jobs",
    "UPDATE public.enquiries",
    "INSERT INTO public.enquiry_stage_history",
    "INSERT INTO public.audit_events",
    "REVOKE ALL ON FUNCTION",
    "TO service_role"
  ]) assert.ok(migration.includes(token), "The transactional RPC is missing: " + token);

  for (const status of ["waiting_parts", "scheduled", "in_progress", "completed", "cancelled"]) {
    assert.ok(migration.includes("'" + status + "'"), "Missing Workcard status handling: " + status);
  }
});

test("transactional Workcard RPC rejects unsupported fields and enforces completion approvals", async () => {
  const migration = await read("../supabase/migrations/20261115123000_update_workcard_with_jobcard_stage_rpc.sql");
  assert.ok(migration.includes("Unsupported Workcard update field"));
  assert.ok(migration.includes("Senior approval is required before completing a Workcard."));
  assert.ok(migration.includes("Customer approval is required before completing a Workcard."));
  assert.ok(migration.includes("A signed-off Workcard cannot have its approved scope overwritten."));
});
