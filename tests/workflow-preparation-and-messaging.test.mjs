import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
const read=path=>readFile(new URL("../"+path,import.meta.url),"utf8");
test("management approval bypass is permission-gated, reasoned and audited",async()=>{
 const sql=await read("supabase/migrations/20261119110000_management_customer_approval_bypass.sql");
 const api=await read("src/app/api/admin/jobs/[id]/approval-override/route.ts");
 assert.match(sql,/workflow\.bypass_customer_approval/);
 assert.match(sql,/customer_approval_bypassed_at/);
 assert.match(sql,/length\(v_reason\)<5/);
 assert.match(sql,/workcard\.customer_approval_bypassed/);
 assert.match(sql,/customer_approval_status','pending'/);
 assert.match(sql,/customer_approval_bypassed_at IS NULL/);
 assert.match(api,/authorizePermission\("workflow\.bypass_customer_approval"\)/);
});
test("management bypass still requires senior review and final payment",async()=>{
 const sql=await read("supabase/migrations/20261119110000_management_customer_approval_bypass.sql");
 assert.match(sql,/senior_approval_status NOT IN \('approved','legacy_approved'\)/);
 assert.match(sql,/A customer-approved or management-bypassed final Workcard is required before payment/);
 assert.match(sql,/v_amount_paid\+0\.005>=v_invoice\.total/);
});
test("staff preparation does not authorise purchases or financial actions",async()=>{
 const sql=await read("supabase/migrations/20261119100000_workcard_preparation_and_message_attachments.sql");
 const api=await read("src/app/api/staff/jobs/[id]/preparation/route.ts");
 assert.match(sql,/jobs\.prepare/);
 assert.match(sql,/workflow\.bypass_customer_approval/);
 assert.match(api,/A parts request cannot be marked purchased or received here/);
 assert.match(api,/awaiting_authorisation/);
 assert.match(api,/Preparation is closed for this Workcard/);
});
test("ticket attachments respect the parent message visibility",async()=>{
 const api=await read("src/app/api/tickets/[id]/messages/route.ts");
 const ui=await read("src/components/ticket-conversation.tsx");
 assert.match(api,/if\(access\.mode!=="staff"\)query=query\.eq\("is_internal",false\)/);
 assert.match(api,/ticket_message_attachments/);
 assert.match(api,/files\.length>5/);
 assert.match(ui,/Attach images or documents/);
 assert.match(ui,/Internal note \(only visible to staff\)/);
});
