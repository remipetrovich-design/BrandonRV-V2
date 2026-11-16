import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
const read=path=>readFile(new URL(path,import.meta.url),"utf8");

test("payroll preparation can prefill approved attendance hours for each pay period",async()=>{
 const migration=await read("../supabase/migrations/20261117130000_payroll_attendance_summary.sql");
 const route=await read("../src/app/api/hr/payroll/route.ts");
 const hub=await read("../src/components/admin-workforce-hub.tsx");
 assert.match(migration,/CREATE OR REPLACE FUNCTION public\.payroll_attendance_hours/);
 assert.match(migration,/approved_at IS NOT NULL/);
 assert.match(migration,/Australia\/Sydney/);
 assert.match(route,/rpc\("payroll_attendance_hours"/);
 assert.match(route,/attendanceHours/);
 assert.match(hub,/Use approved attendance hours/);
});

test("payroll attendance summary is an input only and does not claim statutory payroll calculation",async()=>{
 const hub=await read("../src/components/admin-workforce-hub.tsx");
 assert.match(hub,/does not calculate Australian PAYG, superannuation, award entitlements or submit STP reports/);
 assert.match(hub,/Use approved attendance hours/);
});
