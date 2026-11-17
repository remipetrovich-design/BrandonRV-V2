import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const deploy = await readFile(new URL("../.github/workflows/manual-deploy-latest.yml", import.meta.url), "utf8");
const migrations = await readFile(new URL("../.github/workflows/manual-scan-apply-migrations.yml", import.meta.url), "utf8");
const dispatch = await readFile(new URL("../src/app/api/admin/deployment/dispatch/route.ts", import.meta.url), "utf8");
const status = await readFile(new URL("../src/app/api/admin/deployment/status/route.ts", import.meta.url), "utf8");
const page = await readFile(new URL("../src/components/admin-manual-deploy.tsx", import.meta.url), "utf8");

test("manual production deployment fetches and deploys the newest complete main history", () => {
  assert.match(deploy, /git fetch origin main --force/);
  assert.match(deploy, /git checkout --detach origin\/main/);
  assert.match(deploy, /fetch-depth: 0/);
  assert.match(deploy, /git rev-list --count HEAD/);
  assert.match(deploy, /vercel build --prod/);
  assert.match(deploy, /vercel deploy --prebuilt --prod/);
  assert.match(deploy, /workflow_dispatch:/);
  assert.match(deploy, /if: inputs.confirm == 'YES'/);
  assert.doesNotMatch(deploy, /BRANDON_RV_MANUAL_DEPLOY_ENABLED/);
  assert.doesNotMatch(deploy, /supabase db push|run-supabase-migrations/);
});

test("manual migration workflow scans and applies V2 migrations without deploying", () => {
  assert.match(migrations, /lciylmfpcefdpsouoqvm/);
  assert.match(migrations, /scripts\/check-migrations\.mjs/);
  assert.match(migrations, /run-supabase-migrations\.mjs preview/);
  assert.match(migrations, /run-supabase-migrations\.mjs apply/);
  assert.doesNotMatch(migrations, /vercel build|vercel deploy/);
});

test("deployment API dispatches each action to its own workflow", () => {
  assert.match(dispatch, /scan_apply:"manual-scan-apply-migrations\.yml"/);
  assert.match(dispatch, /deploy:"manual-deploy-latest\.yml"/);
  assert.doesNotMatch(dispatch, /manual-deploy-migrate\.yml/);
});

test("deployment status and admin page expose separate workflow results and controls", () => {
  assert.match(status, /deploymentRun/);
  assert.match(status, /migrationRun/);
  assert.match(page, /Deploy Latest Commit/);
  assert.match(page, /Scan and Apply Migrations/);
  assert.match(page, /snapshot\.deploymentRun/);
  assert.match(page, /snapshot\.migrationRun/);
});
