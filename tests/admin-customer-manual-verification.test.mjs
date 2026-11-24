import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const read=p=>readFileSync(new URL(p,import.meta.url),"utf8");
test("customer register includes customer accounts and exposes manual activation for inactive accounts",()=>{
 const page=read("../src/app/admin/[section]/page.tsx");
 assert.match(page,/query\.eq\("primary_group","customer"\)/);
 assert.match(page,/row\.status==="unverified"/);
 assert.match(page,/AdminCustomerActivation/);
 assert.doesNotMatch(page,/AdminCustomerEmailVerification/);
});
test("manual activation requires permission and activates the customer account",()=>{
 const api=read("../src/app/api/admin/customers/[id]/activate/route.ts");
 assert.match(api,/customers\.manage/);
 assert.match(api,/sameOrigin/);
 assert.match(api,/status:"active"/);
 assert.match(api,/customer\.account_manually_activated/);
 assert.doesNotMatch(api,/email_verified_at|verify-email/);
});
test("activation control refreshes and displays success or failure banner",()=>{
 const component=read("../src/components/admin-customer-activation.tsx");
 assert.match(component,/\/activate/);
 assert.match(component,/router\.refresh/);
 assert.match(component,/form-banner-success/);
 assert.match(component,/form-banner-error/);
});
