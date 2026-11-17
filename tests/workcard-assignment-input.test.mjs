import test from "node:test";
import assert from "node:assert/strict";
import { normalizeWorkcardStaffIds } from "../src/lib/workcard-assignment-input.mjs";

const staffA = "b2e1b3a7-3d52-4e47-9a3d-4a2e4b8e2f01";
const staffB = "a8c5c8e1-6a75-4d80-9c3d-42e1b74e2c11";

test("normalizes valid Workcard staff UUIDs and removes duplicate assignments", () => {
  assert.deepEqual(normalizeWorkcardStaffIds([staffA, staffB, staffA]), [staffA, staffB]);
});

test("allows an empty staff list so an authorised manager can clear assignments", () => {
  assert.deepEqual(normalizeWorkcardStaffIds([]), []);
});

test("rejects non-arrays, non-string values and malformed staff identifiers", () => {
  assert.equal(normalizeWorkcardStaffIds(null), null);
  assert.equal(normalizeWorkcardStaffIds("staff-id"), null);
  assert.equal(normalizeWorkcardStaffIds([staffA, 42]), null);
  assert.equal(normalizeWorkcardStaffIds([{}]), null);
  assert.equal(normalizeWorkcardStaffIds(["not-a-uuid"]), null);
});

test("rejects more than twenty submitted staff identifiers before deduplication", () => {
  assert.equal(normalizeWorkcardStaffIds(Array(21).fill(staffA)), null);
});

import { readFile } from "node:fs/promises";
const read = path => readFile(new URL(path, import.meta.url), "utf8");

test("admin Workcard assignment endpoint validates IDs before its tenant-scoped transaction", async () => {
  const route = await read("../src/app/api/admin/jobs/[id]/assign/route.ts");
  assert.match(route, /userHasPermission\(user\.id,\"jobs\.assign\"\)/);
  assert.match(route, /normalizeWorkcardStaffIds\(body\.staffIds\)/);
  assert.match(route, /p_business_id:membership\.business_id/);
  assert.match(route, /p_actor_user_id:user\.id/);
  assert.match(route, /p_staff_ids:ids/);
  assert.match(route, /replace_workcard_assignments/);
});
