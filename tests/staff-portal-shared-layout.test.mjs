import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

 test("Staff Portal page shells override the customer portal two-column grid",()=>{
  const css=readFileSync(new URL("../src/app/globals.css",import.meta.url),"utf8");
  const match=css.match(/\.brv-admin-frame\\s+\\.brv-admin-main\\s*>\\s*\\.brv-admin-content\\s+\\.portal-shell\\s*\\{([^}]*)\\}/s);
  assert.ok(match,"a final, shared Staff Portal shell override must exist in the global stylesheet");
  assert.match(match[1],/display:\\s*block\\s*!important/);
  assert.match(match[1],/grid-template-columns:\\s*minmax\\(0,\\s*1fr\\)\\s*!important/);
 });
