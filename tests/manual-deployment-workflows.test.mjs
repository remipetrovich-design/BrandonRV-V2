import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const deploy = await readFile(new URL("../.github/workflows/manual-deploy-latest.yml", import.meta.url), "utf8");
const fullScan = await readFile(new URL("../.github/workflows/manual-full-scan.yml", import.meta.url), "utf8");
const migrations = await readFile(new URL("../.github/workflows/manual-scan-apply-migrations.yml", import.meta.url), "utf8");\nconst diagnostic = await readFile(new URL("../.github/workflows/reconcile-migration-history.yml", import.meta.url), "utf8");\nconst dispatch = await readFile(new URL("../src/app/api/admin/deployment/dispatch/route.ts", import.meta.url), "utf8");\nconst status = await readFile(new URL("../src/app/api/admin/deployment/status/route.ts", import.meta.url), "utf8");\nconst logs = await readFile(new URL("../src/app/api/admin/deployment/logs/route.ts", import.meta.url), "utf8");\nconst retry = await readFile(new URL("../src/app/api/admin/deployment/retry/route.ts", import.meta.url), "utf8");\nconst control = await readFile(new URL("../src/components/admin-manual-deploy.tsx", import.meta.url), "utf8");
const dispatch = await readFile(new URL("../src/app/api/admin/deployment/dispatch/route.ts", import.meta.url), "utf8");
const status = await readFile(new URL("../src/app/api/admin/deployment/status/route.ts", import.meta.url), "utf8");
const page = await readFile(new URL("../src/components/admin-manual-deploy.tsx", import.meta.url), "utf8");

test("manual production deployment fetches and deploys the newest complete main history after exact-commit Full Scan", () => {
  assert.match(deploy, /git fetch origin main --force/);
  assert.match(deploy, /git checkout --detach origin\/main/);
  assert.match(deploy, /fetch-depth: 0/);
  assert.match(deploy, /git rev-list --count HEAD/);
  assert.match(deploy, /manual-full-scan\.yml\/runs/);
  assert.match(deploy, /\.head_sha == \$sha and \.status == "completed" and \.conclusion == "success"/);
  assert.match(deploy, /vercel build --prod/);
  assert.match(deploy, /vercel deploy --prebuilt --prod/);
  assert.match(deploy, /workflow_dispatch:/);
  assert.match(deploy, /if: inputs.confirm == 'YES'/);
  assert.doesNotMatch(deploy, /BRANDON_RV_MANUAL_DEPLOY_ENABLED/);
  assert.doesNotMatch(deploy, /supabase db push|run-supabase-migrations/);
});

test("Full Scan is a confirmed read-only test, typecheck, migration-check and Production build workflow", () => {
  assert.match(fullScan, /workflow_dispatch:/);
  assert.match(fullScan, /confirm == 'YES'/);
  assert.match(fullScan, /run: npm test/);
  assert.match(fullScan, /run: npm run typecheck/);
  assert.match(fullScan, /node scripts\/check-migrations\.mjs/);
  assert.match(fullScan, /vercel build --prod/);
  assert.doesNotMatch(fullScan, /vercel deploy|supabase db push|run-supabase-migrations\.mjs apply/);
});

test("manual migration workflow applies V2 migrations independently and never deploys", () => {
  assert.match(migrations, /lciylmfpcefdpsouoqvm/);
  assert.match(migrations, /scripts\/check-migrations\.mjs/);
  assert.match(migrations, /run-supabase-migrations\.mjs preview/);
  assert.match(migrations, /run-supabase-migrations\.mjs apply/);
  assert.doesNotMatch(migrations, /vercel build|vercel deploy/);
});

test("deployment API dispatches each action to its own workflow", () => {
  assert.match(dispatch, /full_scan:"manual-full-scan\.yml"/);
  assert.match(dispatch, /scan_apply:"manual-scan-apply-migrations\.yml"/);
  assert.match(dispatch, /deploy:"manual-deploy-latest\.yml"/);
});

test("deployment status and admin page expose separate workflow results and checks", () => {
  assert.match(status, /fullScanRun/);
  assert.match(status, /deploymentRun/);
  assert.match(status, /migrationRun/);
  assert.match(status, /check-runs/);
  assert.match(page, /Run Full Scan/);
  assert.match(page, /Deploy Latest Commit/);
  assert.match(page, /Scan and Apply Migrations/);
  assert.match(page, /Commit checks/);
});


test("staff deployment control exposes read-only migration diagnostic through API, status and logs",()=>{
 assert.match(diagnostic,/confirm == 'CHECK'/);
 assert.match(dispatch,/diagnostic:"reconcile-migration-history\.yml"/);
 assert.match(status,/diagnosticRun/);
 assert.match(logs,/diagnostic:"reconcile-migration-history\.yml"/);
 assert.match(retry,/diagnostic:"reconcile-migration-history\.yml"/);
 assert.match(control,/Diagnose Migration History/);
 assert.match(control,/Migration history diagnostics/);
});
