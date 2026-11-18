import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";

const sidebar=await readFile(new URL("../src/components/portal-sidebar.tsx",import.meta.url),"utf8");
const css=await readFile(new URL("../src/app/globals.css",import.meta.url),"utf8");

test("customer portal navigation follows the simple V1 vertical menu",()=>{
 assert.match(sidebar,/const links=\[/);
 assert.match(sidebar,/links\.map\(link/);
 assert.match(sidebar,/href:"\/portal",label:"Overview"/);
 assert.match(sidebar,/href:"\/portal\/jobcards",label:"My Jobcards"/);
 assert.doesNotMatch(sidebar,/PORTAL_NAV_GROUPS|portal-nav-group/);
});

test("customer portal menu keeps the link labels visible",()=>{
 assert.match(sidebar,/<nav aria-label="Customer portal">/);
 assert.match(sidebar,/<span>\{link\.label\}<\/span>/);
 assert.doesNotMatch(css,/portal-sidebar \.portal-nav-link > span\s*\{[^}]*display:\s*none/);
});
