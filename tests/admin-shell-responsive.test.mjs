import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const shell = await readFile(new URL("../src/components/admin-shell.tsx", import.meta.url), "utf8");
const density = await readFile(new URL("../src/app/admin/admin-density.css", import.meta.url), "utf8");
const globalStyles = await readFile(new URL("../src/app/globals.css", import.meta.url), "utf8");

test("admin navigation has a working accessible mobile drawer", () => {
  assert.match(shell, /brv-admin-menu-toggle/);
  assert.match(shell, /aria-expanded=\{menuOpen\}/);
  assert.match(shell, /aria-controls="brv-admin-navigation"/);
  assert.match(shell, /brv-admin-backdrop/);
  assert.match(shell, /event\.key==="Escape"/);
  assert.match(shell, /onClick=\{\(\)=>setMenuOpen\(false\)\}/);
  assert.match(globalStyles, /\.brv-admin-sidebar\.is-open\{transform:translateX\(0\)\}/);
  assert.match(globalStyles, /\.brv-admin-menu-toggle\{display:flex\}/);
});

test("admin density styles do not force the desktop sidebar on narrow screens", () => {
  assert.doesNotMatch(density, /Desktop-only workspace: keep the fixed navigation visible at every viewport width/);
  assert.doesNotMatch(density, /\.brv-admin-menu-toggle[\s\S]{0,100}display:\s*none\s*!important/);
});
