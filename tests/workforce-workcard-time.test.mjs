import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
const read=path=>readFile(new URL(path,import.meta.url),"utf8");

test("staff time entries can link to a Workcard labour line and enforce one open timer per employee",async()=>{
 const migration=await read("../supabase/migrations/20261117120000_workcard_time_tracking.sql");
 const route=await read("../src/app/api/staff/time/route.ts");
 const component=await read("../src/components/staff-time-clock.tsx");
 assert.match(migration,/ADD COLUMN IF NOT EXISTS work_entry_id uuid REFERENCES public\.job_work_entries/);
 assert.match(migration,/time_entries_one_open_per_staff_idx/);
 assert.match(route,/userHasPermission\(user\.id,"time\.clock"\)/);
 assert.match(route,/entry_type!=="labour"/);
 assert.match(route,/work_entry_id:workEntryId/);
 assert.match(component,/Assigned Workcard/);
 assert.match(component,/Labour task/);
});

test("manager approval updates Workcard actual labour and job hours from approved time only",async()=>{
 const migration=await read("../supabase/migrations/20261117120000_workcard_time_tracking.sql");
 const route=await read("../src/app/api/hr/time-entries/route.ts");
 const hub=await read("../src/components/admin-workforce-hub.tsx");
 assert.match(migration,/CREATE OR REPLACE FUNCTION public\.approve_work_time_entry/);
 assert.match(migration,/approved_at IS NOT NULL/);
 assert.match(migration,/SET quantity_used = v_hours/);
 assert.match(migration,/SET actual_hours = v_job_hours/);
 assert.match(migration,/FROM public\.job_work_entries[\s\S]*entry_type = 'labour'/);
 assert.match(migration,/work_entry_id IS NULL/);
 assert.match(route,/rpc\("approve_work_time_entry"/);
 assert.match(hub,/Approve time/);
});

test("workforce page exposes completed time entries for manager review",async()=>{
 const page=await read("../src/app/admin/workforce/page.tsx");
 const hub=await read("../src/components/admin-workforce-hub.tsx");
 assert.match(page,/timeManage/);
 assert.match(hub,/api\/hr\/time-entries/);
 assert.match(hub,/Job time review/);
});
