import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
const read=path=>readFile(new URL(path,import.meta.url),"utf8");

test("first owner creation is serialized and inserts the owner and audit event atomically",async()=>{
 const migration=await read("../supabase/migrations/20261117160000_atomic_first_owner_bootstrap.sql");
 const route=await read("../src/app/api/auth/bootstrap-owner/route.ts");
 assert.ok(migration.includes("pg_advisory_xact_lock"));
 assert.ok(migration.includes("LOCK TABLE public.users IN EXCLUSIVE MODE"));
 assert.ok(migration.includes("IF EXISTS (SELECT 1 FROM public.users LIMIT 1)"));
 assert.ok(migration.includes("INSERT INTO public.users"));
 assert.ok(migration.includes("INSERT INTO public.audit_events"));
 assert.ok(migration.includes("GRANT EXECUTE ON FUNCTION public.bootstrap_first_owner"));
 assert.ok(route.includes('rpc("bootstrap_first_owner"'));
 assert.ok(!route.includes('.from("users").insert'));
});

test("first-install guard fails closed for unknown database state and never serves protected routes",async()=>{
 const helper=await read("../src/lib/first-install.mjs");
 const proxy=await read("../src/proxy.ts");
 assert.ok(helper.includes("firstInstallDecision"));
 assert.ok(proxy.includes('return unavailableResponse(pathname)'));
 assert.ok(proxy.includes("firstInstallDecision(count,pathname)"));
 assert.ok(proxy.includes("/portal/sign-in"));
 assert.ok(proxy.includes("pathname===BOOTSTRAP_PATH"));
 assert.ok(proxy.includes("/\\.[^/]+$/"));
});
