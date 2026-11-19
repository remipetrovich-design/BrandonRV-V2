import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
test("staff quote acceptance control is available on quotes and Workcard",()=>{
 const quotePage=readFileSync(new URL("../src/app/admin/quotes/page.tsx",import.meta.url),"utf8");
 const workcard=readFileSync(new URL("../src/components/admin-workcard-management.tsx",import.meta.url),"utf8");
 assert.match(quotePage,/QuoteAcceptOnBehalf quoteId=\{q\.id\}/);
 assert.match(workcard,/QuoteAcceptOnBehalf quoteId=\{job\.quotes\.id\}/);
});
