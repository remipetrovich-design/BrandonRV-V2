import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = path => readFile(new URL(path, import.meta.url), "utf8");
const migrationPath = "../supabase/migrations/20261114201059_create_invoice_from_approved_workcard_rpc.sql";

test("final invoice creation is backed by the applied transactional function called by the API", async () => {
  const route = await read("../src/app/api/admin/invoices/route.ts");
  const migration = await read(migrationPath);
  assert.ok(route.includes('rpc("create_invoice_from_approved_workcard"'));
  assert.match(migration, /CREATE OR REPLACE FUNCTION public\.create_invoice_from_approved_workcard/);
});

test("invoice creation function locks the Workcard and prevents duplicate invoices", async () => {
  const migration = await read(migrationPath);
  assert.match(migration, /FROM public\.jobs[\s\S]*?FOR UPDATE/);
  assert.match(migration, /FROM public\.invoices[\s\S]*?job_id[\s\S]*?RAISE EXCEPTION/);
});

test("invoice lines must match every actual invoiceable Workcard entry", async () => {
  const migration = await read(migrationPath);
  assert.match(migration, /FROM public\.job_work_entries/);
  assert.match(migration, /invoiceable\s*=\s*true/);
  assert.match(migration, /quantity_used\s*>\s*0/);
  assert.match(migration, /source_entry_id/);
  assert.match(migration, /v_quantity IS DISTINCT FROM v_entry\.quantity_used/);
  assert.match(migration, /v_unit_price IS DISTINCT FROM v_entry\.unit_price/);
  assert.match(migration, /v_tax_rate IS DISTINCT FROM v_entry\.tax_rate/);
  assert.match(migration, /v_line_total IS DISTINCT FROM round\(/);
  assert.match(migration, /v_item_count <> v_entry_count/);
});

test("invoice, invoice items and audit event are written inside the same restricted database function", async () => {
  const migration = await read(migrationPath);
  for (const statement of [
    "INSERT INTO public.invoices",
    "INSERT INTO public.invoice_items",
    "INSERT INTO public.audit_events",
    "REVOKE ALL ON FUNCTION",
    "GRANT EXECUTE ON FUNCTION"
  ]) assert.ok(migration.includes(statement), "Missing transactional invoice operation: " + statement);
  assert.match(migration, /SET search_path = ''/);
  assert.match(migration, /TO service_role/);
});
