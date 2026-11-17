import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const component = await readFile(new URL("../src/components/admin-manual-deploy.tsx", import.meta.url), "utf8");

test("both manual operation buttons remain enabled when in-app dispatch is unavailable", () => {
  assert.equal((component.match(/disabled=\{!!busy\}/g) || []).length, 2);
  assert.doesNotMatch(component, /disabled=\{!activated/);
  assert.match(component, /if\(busy\)return;[\s\S]*?if\(!available\)[\s\S]*?window\.open/);
});
