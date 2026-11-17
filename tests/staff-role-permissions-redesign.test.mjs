import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
const read=path=>readFile(new URL(path,import.meta.url),"utf8");

test("staff page hosts the shared roles and permissions manager",async()=>{
 const staff=await read("../src/app/admin/staff/page.tsx");
 const manager=await read("../src/components/admin-role-permissions.tsx");
 const legacy=await read("../src/app/admin/roles/page.tsx");
 assert.match(staff,/AdminRolePermissions/);
 assert.match(staff,/Roles & permissions/);
 assert.ok(manager.includes('fetch("/api/admin/roles"'));
 assert.match(manager,/Enable all/);
 assert.match(manager,/Clear/);
 assert.match(manager,/Developer controls/);
 assert.match(legacy,/AdminRolePermissions/);
});

test("executive staff assignment is controlled by a configurable permission",async()=>{
 const route=await read("../src/app/api/staff/route.ts");
 const migration=await read("../supabase/migrations/20261118150000_executive_role_assignment_permission.sql");
 assert.match(route,/roles\.assign_executive/);
 assert.doesNotMatch(route,/isGlobalAdministrator/);
 assert.match(route,/You cannot grant permissions that you do not hold/);
 assert.match(route,/permittedRemovals/);
 assert.match(migration,/roles\.assign_executive/);
 for(const role of ["ceo_founder","website_development_specialist","senior_manager"]){
  assert.match(migration,new RegExp(role));
 }
});

test("role permission updates cannot grant permissions the editor does not hold",async()=>{
 const route=await read("../src/app/api/admin/roles/route.ts");
 assert.match(route,/You cannot grant permissions that you do not hold/);
 assert.match(route,/assignablePermissions/);
});

test("role management navigation is consolidated into the staff page",async()=>{
 const layout=await read("../src/app/admin/layout.tsx");
 assert.match(layout,/href:"\/admin\/staff"/);
 assert.doesNotMatch(layout,/href:"\/admin\/roles"/);
});
