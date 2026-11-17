import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
const read=path=>readFile(new URL("../"+path,import.meta.url),"utf8");
test("management can advance an issued quote without recording customer consent",async()=>{
 const sql=await read("supabase/migrations/20261119120000_management_quote_approval_bypass.sql");
 const api=await read("src/app/api/admin/quotes/[id]/approval-override/route.ts");
 assert.match(sql,/workflow\.bypass_customer_approval/);
 assert.match(sql,/v_quote\.status<>'sent'/);
 assert.match(sql,/customer_approval_bypassed_at/);
 assert.match(sql,/customer_response_recorded',false/);
 assert.match(sql,/quote\.customer_approval_bypassed/);
 assert.match(api,/authorizePermission\("workflow\.bypass_customer_approval"\)/);
});
test("management-bypassed quotes can be converted without showing a customer-acceptance claim",async()=>{
 const jobs=await read("src/app/api/admin/jobs/route.ts");
 const editor=await read("src/components/admin-create-job.tsx");
 const customer=await read("src/app/portal/jobcards/[id]/page.tsx");
 assert.match(jobs,/eq\("status","accepted"\)/);
 assert.match(jobs,/customer_approval_bypassed_at/);
 assert.match(editor,/Management bypass recorded/);
 assert.match(editor,/Customer approval was not recorded/);
 assert.match(customer,/without recording customer approval/);
});
