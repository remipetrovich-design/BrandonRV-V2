import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync,accessSync} from "node:fs";
const read=p=>readFileSync(new URL(p,import.meta.url),"utf8");
test("new customer registration creates an active customer account without email verification",()=>{
 const source=read("../src/app/api/auth/register/route.ts");
 assert.match(source,/primary_group:"customer"/);
 assert.match(source,/status:"active"/);
 assert.doesNotMatch(source,/email_verified_at|verificationEnabled|verify-email/);
});
test("manual activation changes an inactive customer account to active without changing its group",()=>{
 const source=read("../src/app/api/admin/customers/[id]/activate/route.ts");
 assert.match(source,/eq\("primary_group","customer"\)\.eq\("status","unverified"\)/);
 assert.match(source,/update\(\{status:"active",primary_group:"customer"/);
 assert.match(source,/customer\.account_manually_activated/);
 assert.doesNotMatch(source,/email_verified_at|verify-email/);
});
test("customer register includes customer accounts and shows account status",()=>{
 const source=read("../src/app/admin/[section]/page.tsx");
 assert.match(source,/query\.eq\("primary_group","customer"\)/);
 assert.match(source,/Account: "\+label\(row\.status\)/);
 assert.match(source,/row\.status==="unverified"/);
});
test("unverified status remains system-controlled and cannot be manually selected",()=>{
 const profile=read("../src/components/admin-customer-profile.tsx");
 const actions=read("../src/components/admin-record-actions.tsx");
 const api=read("../src/app/api/admin/customers/[id]/route.ts");
 assert.match(profile,/Unverified \(system controlled\)/);
 assert.match(profile,/disabled/);
 assert.doesNotMatch(profile,/<option value="unverified">Unverified<\/option>/);
 assert.doesNotMatch(actions,/customers:\["unverified"/);
 assert.match(api,/\["active","suspended","banned"\]/);
 assert.doesNotMatch(api,/\["unverified","active","suspended","banned"\]/);
});
test("login no longer requires email verification",()=>{
 const source=read("../src/app/api/auth/login/route.ts");
 assert.match(source,/const passwordValid=!!user&&await passwordMatches\(password,user\.password_hash\)/);
 assert.match(source,/user\.status==="unverified"/);
 assert.match(source,/This account has not been activated/);
 assert.doesNotMatch(source,/verify your email|check your inbox|email_verified_at/);
});
test("legacy email verification routes are absent",()=>{
 for(const path of ["../src/app/api/auth/verify-email/route.ts","../src/app/api/admin/customers/[id]/verify-email/route.ts","../src/app/portal/verify-email/page.tsx"]){
  try{accessSync(new URL(path,import.meta.url));assert.fail("Legacy verification path should not exist: "+path);}catch(error){if(error?.code!=="ENOENT")throw error;}
 }
});
