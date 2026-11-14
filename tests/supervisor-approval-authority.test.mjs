import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
const source=path=>readFile(new URL(path,import.meta.url),"utf8");

test("quote and Workcard approval authority is granted from Supervisor upwards",async()=>{
 const migration=await source("../supabase/migrations/20261115090000_supervisor_approval_authority.sql");
 for(const role of ["supervisor","office_supervisor","office_manager","manager","senior_manager","administrator","general_manager"]){
  assert.ok(migration.includes("'"+role+"'"),role+" must receive approval authority");
 }
 assert.match(migration,/'supervisor','quotes\.view'/);
 assert.match(migration,/'supervisor','quotes\.approve'/);
 assert.match(migration,/jobs\.approve/);
 assert.doesNotMatch(migration,/team_leader/);
});

test("day-to-day job managers cannot approve Workcards unless separately authorised",async()=>{
 const completed=await source("../src/app/api/admin/jobs/[id]/approval/route.ts");
 const setup=await source("../src/app/api/admin/jobs/[id]/workcard-review/route.ts");
 assert.match(completed,/GET[\s\S]*?authorizePermission\("jobs\.manage"\)/);
 assert.match(completed,/POST[\s\S]*?authorizePermission\("jobs\.approve"\)/);
 assert.match(setup,/GET[\s\S]*?authorizePermission\("jobs\.manage"\)/);
 assert.match(setup,/POST[\s\S]*?authorizePermission\("jobs\.approve"\)/);
 assert.match(completed,/canApprove=await userHasPermission/);
 assert.match(setup,/canApprove=await userHasPermission/);
});

test("non-supervisory staff see approval status but not approval actions",async()=>{
 const setupUi=await source("../src/components/admin-workcard-setup-review.tsx");
 const jobUi=await source("../src/components/admin-job-tools.tsx");
 assert.match(setupUi,/canApprove\?<>/);
 assert.match(setupUi,/Supervisor approval is required/);
 assert.match(jobUi,/canManage&&canApprove&&review/);
});
