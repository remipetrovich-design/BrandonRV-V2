import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
const read=path=>readFile(new URL("../"+path,import.meta.url),"utf8");

test("staff Workcard attachments are signed concurrently and related records load in parallel",async()=>{
 const route=await read("src/app/api/staff/jobs/route.ts");
 assert.match(route,/Promise\.all\(\[\s*appointmentQuery\s*,\s*attachmentQuery\s*\]\)/);
 assert.match(route,/Promise\.all\(\(jobcardFiles\?\?\[\]\)\.map/);
 assert.doesNotMatch(route,/for\s*\(const file of jobcardFiles\?\?\[\]\)\s*\{\s*const \{data:signed\}=await db\.storage/);
});

test("staff Workcard actions do not refetch the entire assignment list after every save",async()=>{
 const component=await read("src/components/staff-work-orders.tsx");
 assert.doesNotMatch(component,/setNotice\("Workcard updated\."\);await load\(\);/);
});

test("admin Workcard saves do not trigger a redundant full server-component refresh",async()=>{
 const component=await read("src/components/admin-workcard-management.tsx");
 assert.doesNotMatch(component,/setNotice\("Workcard updated\."\);router\.refresh\(\);/);
 assert.doesNotMatch(component,/await load\(\);setActiveTab\("booking"\);router\.refresh\(\);/);
});
