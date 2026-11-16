import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";

const read=path=>readFile(new URL(path,import.meta.url),"utf8");

test("customer approval updates the Jobcard pipeline in the same database transaction as invoice issue",async()=>{
 const route=await read("../src/app/api/portal/jobs/[id]/approval/route.ts");
 const migration=await read("../supabase/migrations/20261117100000_atomic_jobcard_pipeline_transitions.sql");
 assert.match(route,/rpc\("respond_to_completed_workcard"/);
 assert.doesNotMatch(route,/from\("enquiries"\)\.update/);
 assert.doesNotMatch(route,/from\("enquiry_stage_history"\)\.insert/);
 assert.match(migration,/UPDATE public\.enquiries/);
 assert.match(migration,/SET stage = 'invoiced'/);
 assert.match(migration,/INSERT INTO public\.enquiry_stage_history/);
 assert.match(migration,/Customer approved the completed Workcard and the final invoice was issued/);
});

test("payment, invoice balance and Jobcard closeout share one transaction",async()=>{
 const route=await read("../src/app/api/admin/invoices/[id]/payments/route.ts");
 const migration=await read("../supabase/migrations/20261117100000_atomic_jobcard_pipeline_transitions.sql");
 assert.match(route,/rpc\("record_invoice_payment"/);
 assert.doesNotMatch(route,/from\("enquiries"\)/);
 assert.doesNotMatch(route,/from\("enquiry_stage_history"\)/);
 assert.match(migration,/INSERT INTO public\.payments/);
 assert.match(migration,/UPDATE public\.invoices/);
 assert.match(migration,/SET stage = 'awaiting_payment'/);
 assert.match(migration,/SET stage = 'closed'/);
 assert.match(migration,/SET archived_at = v_now/);
 assert.match(migration,/guest_access_token_hash = NULL/);
 assert.match(migration,/INSERT INTO public\.audit_events/);
});

test("pipeline history is written only when a real Jobcard stage transition occurs",async()=>{
 const migration=await read("../supabase/migrations/20261117100000_atomic_jobcard_pipeline_transitions.sql");
 assert.match(migration,/v_jobcard\.stage IS DISTINCT FROM 'invoiced'/);
 assert.match(migration,/v_enquiry\.stage IS DISTINCT FROM 'awaiting_payment'/);
 assert.match(migration,/from_stage,to_stage,changed_by,note/);
});
