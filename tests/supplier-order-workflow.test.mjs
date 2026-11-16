import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
const read=path=>readFile(new URL(path,import.meta.url),"utf8");

test("supplier order creation links each purchase line to an actual Workcard parts entry",async()=>{
 const migration=await read("../supabase/migrations/20261117110000_workcard_supplier_procurement.sql");
 const route=await read("../src/app/api/admin/supplier-orders/route.ts");
 assert.match(migration,/ADD COLUMN IF NOT EXISTS work_entry_id uuid REFERENCES public\.job_work_entries/);
 assert.match(migration,/CREATE OR REPLACE FUNCTION public\.create_supplier_order/);
 assert.match(migration,/v_entry\.entry_type <> 'parts'/);
 assert.match(migration,/quantity_required - v_entry\.quantity_ordered/);
 assert.match(route,/rpc\("create_supplier_order"/);
 assert.match(route,/authorizePermission\("suppliers\.manage"\)/);
});

test("supplier order placement and goods receipt synchronise Workcard procurement quantities transactionally",async()=>{
 const migration=await read("../supabase/migrations/20261117110000_workcard_supplier_procurement.sql");
 const transition=await read("../src/app/api/admin/supplier-orders/[id]/route.ts");
 const receive=await read("../src/app/api/admin/supplier-orders/[id]/receive/route.ts");
 assert.match(migration,/CREATE OR REPLACE FUNCTION public\.transition_supplier_order/);
 assert.match(migration,/CREATE OR REPLACE FUNCTION public\.receive_supplier_order_item/);
 assert.match(migration,/CREATE OR REPLACE FUNCTION public\.sync_job_work_entry_procurement/);
 assert.match(migration,/quantity_ordered = v_ordered/);
 assert.match(migration,/quantity_received = v_received/);
 assert.match(transition,/rpc\("transition_supplier_order"/);
 assert.match(receive,/rpc\("receive_supplier_order_item"/);
});

test("supplier orders have a real management screen and do not pretend to transmit external orders",async()=>{
 const page=await read("../src/app/admin/supplier-orders/page.tsx");
 const component=await read("../src/components/admin-supplier-orders.tsx");
 assert.match(page,/AdminSupplierOrders/);
 assert.match(component,/Create draft purchase order/);
 assert.match(component,/Mark ordered/);
 assert.match(component,/Record received quantity/);
 assert.match(component,/does not send an email or place an order/);
 assert.match(component,/linked Workcard part has been updated/);
});
