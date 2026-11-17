import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";

const css=await readFile(new URL("../src/app/globals.css",import.meta.url),"utf8");

test("customer portal uses a dedicated desktop sidebar at normal PC widths",()=>{
  assert.match(css,/@media \(min-width: 641px\)[\s\S]*?\.portal-shell\s*\{[\s\S]*?grid-template-columns:\s*250px minmax\(0, 1fr\)/);
  assert.match(css,/\.portal-sidebar\s*\{[\s\S]*?width:\s*250px;[\s\S]*?height:\s*max-content/);
});

test("desktop customer navigation rows remain compact and do not stretch vertically",()=>{
  assert.match(css,/\.portal-sidebar \.portal-nav-group\s*\{[\s\S]*?grid-auto-rows:\s*max-content/);
  assert.match(css,/\.portal-sidebar \.portal-nav-link,[\s\S]*?height:\s*42px;[\s\S]*?min-height:\s*42px;[\s\S]*?max-height:\s*42px/);
});
