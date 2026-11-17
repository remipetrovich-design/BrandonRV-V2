import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
const read=(name)=>readFile(new URL("../.github/workflows/"+name,import.meta.url),"utf8");
const full=await read("manual-full-scan.yml"),deploy=await read("manual-deploy-latest.yml"),migrations=await read("manual-scan-apply-migrations.yml");
test("Full Scan is manual, confirmed, read-only and runs tests, typecheck, migration checks and a Production build",()=>{assert.match(full,/workflow_dispatch:/);assert.match(full,/confirm == 'YES'/);assert.match(full,/run: npm test/);assert.match(full,/run: npm run typecheck/);assert.match(full,/node scripts\/check-migrations\.mjs/);assert.match(full,/vercel build --prod/);assert.doesNotMatch(full,/vercel deploy|supabase db push|run-supabase-migrations\.mjs apply/);});
test("Production deployment requires a successful Full Scan for the exact latest main SHA",()=>{assert.match(deploy,/manual-full-scan\.yml\/runs/);assert.match(deploy,/\.head_sha == \$sha and \.status == "completed" and \.conclusion == "success"/);assert.match(deploy,/git fetch origin main --force/);assert.match(deploy,/fetch-depth: 0/);});
test("Database migration apply remains a separate workflow and never deploys",()=>{assert.match(migrations,/workflow_dispatch:/);assert.match(migrations,/run-supabase-migrations\.mjs apply/);assert.doesNotMatch(migrations,/vercel deploy|vercel build/);});
