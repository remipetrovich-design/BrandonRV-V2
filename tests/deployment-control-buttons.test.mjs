import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
const component=await readFile(new URL("../src/components/admin-manual-deploy.tsx",import.meta.url),"utf8");
const dispatch=await readFile(new URL("../src/app/api/admin/deployment/dispatch/route.ts",import.meta.url),"utf8");
test("deployment controls expose independent full scan, migration and latest-commit actions",()=>{assert.match(component,/dispatch\("full_scan"\)/);assert.match(component,/dispatch\("scan_apply"\)/);assert.match(component,/dispatch\("deploy"\)/);assert.equal((component.match(/disabled=\{!!busy\}/g)||[]).length,3);});
test("manual deployment remains gated while scan and migration actions remain separate",()=>{assert.match(component,/action==="deploy"&&!activated/);assert.match(dispatch,/action==="deploy"&&String\(process\.env\.BRANDON_RV_MANUAL_DEPLOY_ENABLED/);assert.match(dispatch,/full_scan:"manual-full-scan\.yml"/);assert.match(dispatch,/scan_apply:"manual-scan-apply-migrations\.yml"/);});
test("the deployment page exposes commit checks and distinct operation status",()=>{assert.match(component,/Commit checks/);assert.match(component,/Latest full scan/);assert.match(component,/Latest migration operation/);assert.match(component,/Latest deployment/);});
