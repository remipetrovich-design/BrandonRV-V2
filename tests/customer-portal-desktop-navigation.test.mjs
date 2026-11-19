import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";

const sidebar=await readFile(new URL("../src/components/portal-sidebar.tsx",import.meta.url),"utf8");
const css=await readFile(new URL("../src/app/globals.css",import.meta.url),"utf8");

test("customer portal navigation groups overview, service records and account tools",()=>{
 assert.match(sidebar,/const links=\[/);
 assert.match(sidebar,/title:"OVERVIEW"/);
 assert.match(sidebar,/title:"SERVICE"/);
 assert.match(sidebar,/title:"MY ACCOUNT"/);
 assert.match(sidebar,/group\.items\.map\(link/);
 assert.match(sidebar,/href:"\/portal",label:"Overview"/);
 assert.match(sidebar,/href:"\/portal\/jobcards",label:"My Jobcards"/);
});

test("customer portal menu keeps the link labels visible",()=>{
 assert.match(sidebar,/<nav aria-label="Customer portal">/);
 assert.match(sidebar,/<span>\{link\.label\}<\/span>/);
 assert.doesNotMatch(css,/portal-sidebar \.portal-nav-link > span\s*\{[^}]*display:\s*none/);
});
