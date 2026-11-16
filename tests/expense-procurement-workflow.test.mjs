import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
const read=path=>readFile(new URL(path,import.meta.url),"utf8");

test("expenses can be recorded against the same supplier order and Workcard",async()=>{
 const migration=await read("../supabase/migrations/20261117140000_finance_expense_procurement_link.sql");
 const route=await read("../src/app/api/admin/expenses/route.ts");
 const page=await read("../src/app/admin/expenses/page.tsx");
 const component=await read("../src/components/admin-expenses.tsx");
 assert.ok(migration.includes("ADD COLUMN IF NOT EXISTS supplier_order_id uuid"));
 assert.ok(migration.includes("REFERENCES public.supplier_orders"));
 assert.ok(migration.includes("CREATE OR REPLACE FUNCTION public.create_expense"));
 assert.ok(migration.includes("CREATE OR REPLACE FUNCTION public.review_expense"));
 assert.ok(migration.includes("INSERT INTO public.audit_events"));
 assert.ok(route.includes('authorizePermission("expenses.view")'));
 assert.ok(route.includes('rpc("create_expense"'));
 assert.ok(route.includes('rpc("review_expense"'));
 assert.ok(page.includes("AdminExpenses"));
 assert.ok(component.includes("supplier_order_id"));
 assert.ok(route.includes("createSignedUrl"));
 assert.ok(migration.includes("p_storage_path NOT LIKE"));
});

test("expense approval is separate from recording and is business-scoped",async()=>{
 const migration=await read("../supabase/migrations/20261117140000_finance_expense_procurement_link.sql");
 assert.match(migration,/p_business_id uuid[\s\S]*p_expense_id uuid[\s\S]*p_approved boolean/);
 assert.ok(migration.includes("WHERE id = p_expense_id AND business_id = p_business_id"));
 assert.ok(migration.includes("approved_by = CASE WHEN p_approved THEN p_actor_user_id ELSE NULL END"));
 assert.ok(migration.includes("approved_at = CASE WHEN p_approved THEN v_now ELSE NULL END"));
});
