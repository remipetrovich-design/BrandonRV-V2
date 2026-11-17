import test from "node:test";
import assert from "node:assert/strict";
import {readFile,readdir} from "node:fs/promises";
const read=path=>readFile(new URL(path,import.meta.url),"utf8");
const migrationPath="../supabase/migrations/20261117230000_workcard_customer_approval_invoice_issue.sql";

test("Supabase migration versions are unique and the applied invoice source has one canonical filename",async()=>{
 const files=await readdir(new URL("../supabase/migrations/",import.meta.url));
 const versions=files.filter(name=>name.endsWith(".sql")).map(name=>name.match(/^(\d{14})_/)?.[1]).filter(Boolean);
 const duplicates=versions.filter((version,index)=>versions.indexOf(version)!==index);
 assert.deepEqual([...new Set(duplicates)],[]);
 assert.ok(files.includes("20261117102142_invoice_issue_payment_credit_lifecycle_20261117220000.sql"));
 assert.ok(!files.includes("20261117102142_invoice_issue_payment_credit_lifecycle.sql"));
});

test("invoice issuer identity matches the application's public user model",async()=>{
 const migration=await read(migrationPath);
 const invoiceLifecycle=await read("../supabase/migrations/20261117102142_invoice_issue_payment_credit_lifecycle_20261117220000.sql");
 assert.match(migration,/FOREIGN KEY \(issued_by\) REFERENCES public\.users\(id\)/);
 assert.match(migration,/v_issuer_user_id := coalesce\(v_job\.senior_approved_by,v_job\.worker_signed_off_by\)/);
 assert.match(migration,/PERFORM public\.issue_invoice\(v_invoice\.id,p_business_id,v_issuer_user_id\)/);
 assert.doesNotMatch(migration,/v_issuer_user_id := coalesce\([^)]*p_actor_user_id/);
 assert.match(invoiceLifecycle,/issued_at=v_now/);
 assert.match(invoiceLifecycle,/issued_by=p_actor_user_id/);
});

test("accepted Workcard assignments survive team edits",async()=>{
 const migration=await read(migrationPath);
 assert.match(migration,/AND status IN \('assigned','declined'\)/);
 assert.match(migration,/status = 'accepted'/);
 assert.doesNotMatch(migration,/DELETE FROM public\.job_assignments/);
});

test("parts procurement holds work until required quantities are received or marked not required",async()=>{
 const migration=await read(migrationPath);
 assert.match(migration,/All required parts must be received or marked not required before work can start/);
 assert.match(migration,/e\.quantity_required > greatest\(0,e\.quantity_received-e\.quantity_returned\)/);
 assert.match(migration,/e\.part_order_status <> 'not_required'/);
 assert.match(migration,/CREATE OR REPLACE FUNCTION public\.sync_job_work_entry_procurement/);
 assert.match(migration,/parts\.part_order_status <> 'not_required'/);
 assert.match(migration,/ELSE 'ready_to_schedule'/);
});

test("Workcard execution and review advance the original Jobcard pipeline",async()=>{
 const migration=await read(migrationPath);
 assert.match(migration,/stage='work_in_progress'/);
 assert.match(migration,/stage='quality_check'/);
 assert.match(migration,/THEN 'ready_to_invoice'/);
 assert.match(migration,/stage='invoiced'/);
 assert.match(migration,/INSERT INTO public\.enquiry_stage_history/);
});

test("customer-requested corrections reopen the Workcard and require fresh sign-off",async()=>{
 const migration=await read(migrationPath);
 assert.match(migration,/customer_approval_status = 'changes_requested'/);
 assert.match(migration,/status = 'in_progress'/);
 assert.match(migration,/worker_signed_off_at = NULL/);
 assert.match(migration,/DELETE FROM public\.invoices/);
 assert.match(migration,/status = 'accepted'/);
 assert.match(migration,/workcardReopened/);
 assert.match(migration,/Customer requested corrections; the Workcard was reopened for rework/);
});

test("invoice payments record awaiting-payment, paid and closed stages atomically",async()=>{
 const migration=await read(migrationPath);
 const route=await read("../src/app/api/admin/invoices/[id]/payments/route.ts");
 assert.match(route,/rpc\("record_invoice_payment_idempotent"/);
 assert.match(migration,/stage='awaiting_payment'/);
 assert.match(migration,/stage='paid'/);
 assert.match(migration,/stage='closed'/);
 assert.match(migration,/archived_at=v_now/);
 assert.match(migration,/guest_access_token_hash=NULL/);
 assert.match(migration,/guest_access_expires_at=NULL/);
 assert.match(migration,/already_recorded/);
 assert.match(migration,/coalesce\(v_archived,false\)/);
});

test("booking updates are serialized and reject overlapping confirmed appointments",async()=>{
 const migration=await read(migrationPath);
 assert.match(migration,/DROP FUNCTION IF EXISTS public\.update_jobcard_booking/);
 assert.match(migration,/p_bypass_conflicts boolean/);
 assert.match(migration,/pg_advisory_xact_lock/);
 assert.match(migration,/That time conflicts with another booking or its travel buffer/);
 const bookingMigration=await read("../supabase/migrations/20261112105152_workcard_booking_uniqueness.sql");
 assert.match(bookingMigration,/appointments_one_open_booking_per_quote_uidx/);
 assert.match(migration,/workcard\.booking_'\|\|p_action/);
 assert.doesNotMatch(migration,/v_quote_ids/);
});

test("all booking entry points use the same transaction and explicit manager override",async()=>{
 const workcard=await read("../src/app/api/admin/jobs/[id]/booking/route.ts");
 const jobcard=await read("../src/app/api/admin/enquiries/[id]/booking/route.ts");
 const staff=await read("../src/app/api/staff/jobs/[id]/booking-request/route.ts");
 const calendar=await read("../src/app/api/admin/[section]/[id]/route.ts");
 const createCalendar=await read("../src/app/api/admin/appointments/route.ts");
 for(const route of [workcard,jobcard,staff,calendar,createCalendar])assert.match(route,/rpc\("update_jobcard_booking"/);
 assert.match(workcard,/p_bypass_conflicts:bypassRestrictions/);
 assert.match(jobcard,/p_bypass_conflicts:isManagerOrAbove/);
 assert.match(staff,/p_bypass_conflicts:false/);
 assert.match(createCalendar,/p_bypass_conflicts:bypassRestrictions/);
 assert.match(calendar,/p_action:update\.status==="confirmed"\?"confirm":"reschedule"/);
 assert.match(calendar,/p_action:"cancel"/);
 assert.doesNotMatch(calendar,/workcard\.booking_synced_from_calendar/);
});
