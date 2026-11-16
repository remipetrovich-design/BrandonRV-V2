import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
const read=path=>readFile(new URL(path,import.meta.url),"utf8");

test("business reporting combines invoices, received payments, approved expenses, procurement and Workcard hours",async()=>{
 const migration=await read("../supabase/migrations/20261117150000_business_financial_reporting.sql");
 const route=await read("../src/app/api/admin/reports/route.ts");
 const page=await read("../src/app/admin/reports/page.tsx");
 const component=await read("../src/components/admin-business-reports.tsx");
 const layout=await read("../src/app/admin/layout.tsx");
 assert.ok(migration.includes("CREATE OR REPLACE FUNCTION public.business_financial_report"));
 assert.ok(migration.includes("Australia/Sydney"));
 assert.ok(migration.includes("approved_at IS NOT NULL"));
 assert.ok(migration.includes("status = 'recorded'"));
 assert.ok(migration.includes("supplier_orders"));
 assert.ok(migration.includes("actual_hours"));
 assert.ok(!migration.includes("pg_catalog.greatest"));
 assert.ok(route.includes('authorizePermission("reports.view")'));
 assert.ok(route.includes('rpc("business_financial_report"'));
 assert.ok(page.includes("AdminBusinessReports"));
 assert.ok(component.includes("cash_received"));
 assert.ok(component.includes("approved_expenses"));
 assert.ok(component.includes("supplier_commitments"));
 assert.ok(layout.includes('href:"/admin/reports",permission:"reports.view"'));
});

test("report data is business-scoped and does not treat draft invoices or unapproved expenses as actuals",async()=>{
 const migration=await read("../supabase/migrations/20261117150000_business_financial_reporting.sql");
 assert.ok(migration.includes("business_id = p_business_id"));
 assert.ok(migration.includes("status NOT IN ('draft','void')"));
 assert.ok(migration.includes("approved_at IS NOT NULL"));
 assert.ok(migration.includes("approved_at IS NULL"));
 assert.ok(migration.includes("p_to >= p_from"));
});
