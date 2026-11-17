import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const migration = await readFile(new URL("../supabase/migrations/20261117240000_invoice_issue_metadata_and_immutable_lines.sql", import.meta.url), "utf8");

test("customer approval issues the final invoice through the canonical lifecycle with a staff issuer", () => {
  assert.match(migration, /FOREIGN KEY \(issued_by\) REFERENCES public\.users\(id\) ON DELETE RESTRICT/);
  assert.match(migration, /v_issue_actor_id := coalesce\(v_job\.senior_approved_by,v_job\.worker_signed_off_by\)/);
  assert.match(migration, /PERFORM public\.issue_invoice\(v_invoice\.id,p_business_id,v_issue_actor_id\)/);
  assert.match(migration, /issued_at\/issued_by/);
  assert.match(migration, /REVOKE ALL ON FUNCTION public\.respond_to_completed_workcard/);
  assert.match(migration, /GRANT EXECUTE ON FUNCTION public\.respond_to_completed_workcard/);
});

test("payment settlement updates the original Jobcard and closes guest access only on full settlement", () => {
  assert.match(migration, /CREATE OR REPLACE FUNCTION public\.record_invoice_payment_idempotent/);
  assert.match(migration, /stage='awaiting_payment'/);
  assert.match(migration, /stage='paid'/);
  assert.match(migration, /archived_at=v_now/);
  assert.match(migration, /guest_access_token_hash=NULL/);
  assert.match(migration, /REVOKE ALL ON FUNCTION public\.record_invoice_payment_idempotent/);
});

test("invoice line updates cannot move a line from an issued invoice into a draft invoice", () => {
  const trigger = migration.slice(migration.indexOf("CREATE OR REPLACE FUNCTION public.prevent_issued_invoice_item_edits"));
  assert.match(trigger, /WHERE id=OLD\.invoice_id/);
  assert.match(trigger, /WHERE id=NEW\.invoice_id/);
  assert.match(trigger, /TG_OP='UPDATE'/);
});
