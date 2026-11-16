import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
const read=path=>readFile(new URL(path,import.meta.url),"utf8");

test("expenses can be recorded against the same supplier order and Workcard",async()=>{
 const migration=await read("../supabase/migrations/20261117140000_finance_expense_procurement_link.sql");
 const route=await read("../src/app/api/admin/expenses/route.ts");
 const page=await read("../src/app/admin/expenses/page.tsx");
 const component=await read("../src/components/admin-expenses.tsx");
 assert.match(migration,/supplier_order_id uuid REFERENCES public\.supplier_orders/);
 assert.match(migration,/CREATE OR REPLACE FUNCTION public\.create_expense/);
 assert.match(migration,/CREATE OR REPLACE FUNCTION public\.review_expense/);
 assert.match(migration,/INSERT INTO public\.audit_events/);
 assert.match(route,/authorizePermission\("expenses\.view"\)/);
 assert.match(route,/rpc\("create_expense"/);
 assert.match(route,/rpc\("review_expense"/);
 assert.match(page,/AdminExpenses/);
 assert.match(component,/supplier_order_id/);
 assert.match(route,/createSignedUrl/);
 assert.match(migration,/p_storage_path NOT LIKE/);
});

test("expense approval is separate from recording and is business-scoped",async()=>{
 const migration=await read("../supabase/migrations/20261117140000_finance_expense_procurement_link.sql");
 assert.match(migration,/p_business_id uuid[\s\S]*p_expense_id uuid[\s\S]*p_approved boolean/);
 assert.match(migration,/WHERE id = p_expense_id AND business_id = p_business_id/);
 assert.match(migration,/approved_by = CASE WHEN p_approved THEN p_actor_user_id ELSE NULL END/);
 assert.match(migration,/approved_at = CASE WHEN p_approved THEN v_now ELSE NULL END/);
});
