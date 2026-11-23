import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
const read=path=>readFile(new URL(path,import.meta.url),"utf8");

test("management can start a Workcard directly without worker acceptance gating",async()=>{
 const component=await read("../src/components/admin-workcard-management.tsx");
 const route=await read("../src/app/api/admin/jobs/[id]/route.ts");
 const engine=await read("../src/lib/workcard-engine.mjs");
 assert.match(component,/onClick=\{\(\)=>void save\("in_progress"\)\}>Start job/);
 assert.doesNotMatch(component,/x==="in_progress"&&status!=="in_progress"/);
 assert.doesNotMatch(route,/Only an assigned worker can start a Workcard/);
 assert.match(route,/canTransitionWorkcardStatus\(current\.status,next\)/);
 assert.match(engine,/pending: \["pending", "scheduled", "waiting_parts", "in_progress", "cancelled"\]/);
});

test("Workcard navigation combines parts and orders and clearly surfaces the primary action",async()=>{
 const component=await read("../src/components/admin-workcard-management.tsx");
 assert.match(component,/\["parts","Parts & orders"\]/);
 assert.doesNotMatch(component,/\["orders","Parts orders"\]/);
 assert.match(component,/brv-workcard-command-bar/);
 assert.match(component,/Work log & sign-off/);
});

test("booking success is shown after refreshing and reports whether the Workcard was updated",async()=>{
 const editor=await read("../src/components/admin-enquiry-editor.tsx");
 assert.match(editor,/await load\(\);setNotice\(Number\(d\.workcardsUpdated\?\?0\)>0/);
 assert.doesNotMatch(editor,/setNotice\("Booking created and linked to the Jobcard and Workcard\."\);await load\(\)/);
 assert.match(editor,/Booking confirmed\. The linked Workcard has been updated\./);
});

test("booking confirmation is allowed while the Workcard is waiting for parts and is recorded in the Jobcard timeline",async()=>{
 const migration=await read("../supabase/migrations/20261123100000_workcard_operator_booking_flow.sql");
 assert.doesNotMatch(migration,/j\.status IN \('in_progress','waiting_parts','completed','cancelled'\)/);
 assert.match(migration,/j\.status IN \('in_progress','completed','cancelled'\)/);
 assert.match(migration,/Booking confirmed; parts workflow remains open/);
 assert.match(migration,/workcards_updated/);
});
