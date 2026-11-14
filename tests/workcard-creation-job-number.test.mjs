import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";

const source=(path)=>readFile(new URL(path,import.meta.url),"utf8");

test("accepted-quote Workcard creation supplies a unique job number to the atomic database workflow",async()=>{
  const route=await source("../src/app/api/admin/jobs/route.ts");
  const schema=await source("../supabase/migrations/20261105113948_brandon_rv_core_portal_and_website.sql");
  const uniqueness=await source("../supabase/migrations/20261112105152_workcard_booking_uniqueness.sql");
  assert.match(schema,/job_number text not null,/);
  assert.match(uniqueness,/jobs_one_workcard_per_quote_idx/);
  assert.match(route,/const jobNumber="BRV-WC-"/);
  assert.match(route,/p_job_number:jobNumber/);
  assert.match(route,/rpc\("create_workcard_from_accepted_quote"/);
});

test("accepted-quote Workcard conversion is atomic, idempotent and fully audited",async()=>{
  const migration=await source("../supabase/migrations/20261115110000_create_workcard_from_accepted_quote_rpc.sql");
  for(const statement of [
    "FOR UPDATE",
    "INSERT INTO public.jobs",
    "INSERT INTO public.job_work_entries",
    "UPDATE public.enquiries",
    "INSERT INTO public.enquiry_stage_history",
    "INSERT INTO public.audit_events",
    "alreadyCreated",
    "quantity_used",
    "invoiceable",
    "REVOKE ALL ON FUNCTION public.create_workcard_from_accepted_quote"
  ])assert.ok(migration.includes(statement),"Missing atomic Workcard conversion control: "+statement);
  assert.match(migration,/jobs_one_workcard_per_quote_idx|quote_id = p_quote_id/);
});

test("Workcard creation logs database failures without exposing internals to the client",async()=>{
  const route=await source("../src/app/api/admin/jobs/route.ts");
  assert.match(route,/console\.error\("Atomic Workcard conversion failed",error\)/);
  assert.match(route,/console\.error\("Workcard creation failed",error\)/);
  assert.match(route,/return jsonError\("Could not create Workcard\.",500\)/);
});
