import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
const migration=await readFile(new URL("../supabase/migrations/20261119100000_workcard_preparation_and_message_attachments.sql",import.meta.url),"utf8");
const route=await readFile(new URL("../src/app/api/staff/jobs/[id]/preparation/route.ts",import.meta.url),"utf8");
test("preparation permissions are separate from financial authority",()=>{
 assert.match(migration,/jobs\.prepare/);
 assert.match(migration,/workflow\.bypass_customer_approval/);
 assert.match(route,/A parts request cannot be marked purchased or received here/);
 assert.match(route,/awaiting_authorisation/);
});
test("preparation records are service-role-only",()=>{
 assert.match(migration,/REVOKE ALL ON public\.job_preparation_items FROM anon,authenticated/);
 assert.match(migration,/GRANT SELECT,INSERT,UPDATE,DELETE ON public\.job_preparation_items TO service_role/);
});
