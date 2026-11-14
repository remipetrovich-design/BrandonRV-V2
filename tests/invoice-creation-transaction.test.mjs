import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = path => readFile(new URL(path, import.meta.url), "utf8");
const migrationPath = "../supabase/migrations/20261115120000_atomic_invoice_creation.sql";

test("final invoice creation is backed by the transactional function called by the API", async () => {
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

test("invoice lines are sourced from actual invoiceable Workcard entries, not trusted client totals", async () => {
  const migration = await read(migrationPath);
  assert.match(migration, /FROM public\.job_work_entries/);
  assert.match(migration, /invoiceable = true/);
  assert.match(migration, /quantity_used > 0/);
  assert.match(migration, /source_entry_id/);
  assert.match(migration, /round\(/i);
});

test("invoice, invoice items and audit event are written inside the same transaction function", async () => {
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
