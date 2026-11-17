import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
const source=path=>readFile(new URL(path,import.meta.url),"utf8");

test("booking overrides are controlled by explicit permissions, not management rank names",async()=>{
 const routes=[
  "../src/app/api/admin/appointments/route.ts",
  "../src/app/api/admin/enquiries/[id]/booking/route.ts",
  "../src/app/api/admin/jobs/[id]/booking/route.ts"
 ];
 for(const route of routes){
  const code=await source(route);
  assert.match(code,/userHasPermission\([^\n]*appointments\.override_scheduling_restrictions/);
  assert.doesNotMatch(code,/isManagerOrAbove/);
 }
});

test("quote self-review override is checked as a distinct permission in the database",async()=>{
 const migration=await source("../supabase/migrations/20261118130000_central_permission_overrides.sql");
 assert.match(migration,/quotes\.approve_self_review/);
 assert.match(migration,/user_has_effective_permission/);
 assert.match(migration,/public\.review_quote/);
 assert.doesNotMatch(migration,/office_manager.*manager.*senior_manager/);
});

test("booking override permission is part of the permission catalogue",async()=>{
 const migration=await source("../supabase/migrations/20261118130000_central_permission_overrides.sql");
 assert.match(migration,/appointments\.override_scheduling_restrictions/);
});
