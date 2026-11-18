import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
const component=await readFile(new URL("../src/components/admin-manual-deploy.tsx",import.meta.url),"utf8");
const dispatch=await readFile(new URL("../src/app/api/admin/deployment/dispatch/route.ts",import.meta.url),"utf8");
test("deployment controls expose independent full scan, migration and latest-commit actions",()=>{
 assert.match(component,/dispatch\("full_scan"\)/);assert.match(component,/dispatch\("scan_apply"\)/);assert.match(component,/dispatch\("deploy"\)/);
 assert.equal((component.match(/onClick=\{\(\)=>dispatch\(/g)||[]).length,3);
});
test("manual deployment does not require the legacy activation flag",()=>{
 assert.doesNotMatch(component,/activated|MANUAL DEPLOY OFF/);assert.doesNotMatch(dispatch,/BRANDON_RV_MANUAL_DEPLOY_ENABLED/);
 assert.match(component,/if\(!configured\).*actions\/workflows/);assert.match(dispatch,/full_scan:"manual-full-scan\.yml"/);assert.match(dispatch,/scan_apply:"manual-scan-apply-migrations\.yml"/);
});
test("the deployment page exposes commit checks, operation status and live consoles",()=>{
 assert.match(component,/Commit checks/);assert.match(component,/Latest full scan/);assert.match(component,/Latest migration operation/);assert.match(component,/Latest deployment/);
 assert.match(component,/Supabase migration output/);assert.match(component,/Vercel deployment output/);assert.match(component,/setInterval\(\(\)=>\{void refresh\(\);\},3000\)/);
});
test("failed jobs can be retried with an explicit warning that source errors need a code fix",()=>{
 assert.match(component,/api\/admin\/deployment\/retry/);assert.match(component,/Retry failed job/);assert.match(component,/does not repair a SQL or source-code error/);
});
