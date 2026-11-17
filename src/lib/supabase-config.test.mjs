import test from "node:test";
import assert from "node:assert/strict";
import { resolveSupabaseUrl } from "./supabase-config.mjs";

const v2 = "https://lciylmfpcefdpsouoqvm.supabase.co";

test("prefers the Vercel Supabase integration URL over a legacy URL", () => {
  assert.equal(resolveSupabaseUrl({ NEXT_PUBLIC_SUPABASE_URL: v2, SUPABASE_URL: "https://old-project.supabase.co" }), v2);
});

test("allows the legacy server URL only when it points to V2", () => {
  assert.equal(resolveSupabaseUrl({ SUPABASE_URL: v2 }), v2);
});

test("rejects a Supabase URL that does not target V2", () => {
  assert.throws(() => resolveSupabaseUrl({ NEXT_PUBLIC_SUPABASE_URL: "https://old-project.supabase.co" }), /dedicated V2 project/);
});

test("rejects missing Supabase URLs", () => {
  assert.throws(() => resolveSupabaseUrl({}), /missing/);
});
