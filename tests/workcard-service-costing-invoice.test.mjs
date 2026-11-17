import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
const read=path=>readFile(new URL(path,import.meta.url),"utf8");

test("Workcard editor exposes detailed actual-work entries and service presets",async()=>{
 const ui=await read("../src/components/admin-workcard-management.tsx");
 const api=await read("../src/app/api/admin/jobs/[id]/work-entries/route.ts");
 assert.match(ui,/work-entries/);
 assert.match(ui,/service_id/);
 assert.match(ui,/quantity_used/);
 assert.match(ui,/cost_unit_price/);
 assert.match(api,/jobs\.manage/);
 assert.match(api,/services/);
});

test("final invoice is calculated from actual Workcard entries, never the estimate quote",async()=>{
 const api=await read("../src/app/api/admin/invoices/route.ts");
 assert.match(api,/job_work_entries/);
 assert.match(api,/invoiceable/);
 assert.doesNotMatch(api,/quote\.quote_items/);
 assert.doesNotMatch(api,/Number\(quote\.subtotal\)/);
});

test("quote creation links catalogue services and retains custom-priced lines",async()=>{
 const ui=await read("../src/components/admin-create-quote.tsx");
 const api=await read("../src/app/api/admin/quotes/route.ts");
 assert.match(ui,/serviceId/);
 assert.match(ui,/Custom service/);
 assert.match(api,/service_id/);
 assert.match(api,/services/);
});


test("final invoice draft is created atomically before customer approval from approved actual Workcard entries",async()=>{
 const api=await read("../src/app/api/admin/invoices/route.ts");
 const migration=await read("../supabase/migrations/20261114201059_create_invoice_from_approved_workcard_rpc.sql");
 assert.match(api,/rpc\("create_invoice_from_approved_workcard"/);
 assert.match(api,/source_entry_id/);
 assert.doesNotMatch(api,/\.from\("invoices"\)\.insert/);
 assert.doesNotMatch(api,/\.from\("invoice_items"\)\.insert/);
 assert.match(migration,/customer_approval_status <> 'pending'/);
 const entryCountQuery=migration.split("SELECT count(*)::integer INTO v_entry_count")[1]?.split(";")[0]??"";
 assert.doesNotMatch(entryCountQuery,/FOR UPDATE/);
 assert.match(migration,/SELECT e\.id,e\.entry_type[\s\S]*?FOR UPDATE;/);
});
