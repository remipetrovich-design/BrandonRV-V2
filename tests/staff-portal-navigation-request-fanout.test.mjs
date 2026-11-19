import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";

const read=path=>readFile(new URL(path,import.meta.url),"utf8");

test("Staff Portal navigation does not prefetch every server-rendered page in the sidebar",async()=>{
 const shell=await read("../src/components/admin-shell.tsx");
 const dashboard=await read("../src/app/admin/page.tsx");
 assert.match(shell,/href=\{item\.href\} prefetch=\{false\}/);
 assert.match(shell,/href="\/admin" prefetch=\{false\}/);
 assert.match(dashboard,/prefetch=\{false\} className="brv-admin-stat"/);
 assert.match(dashboard,/href=\{item\.href\} prefetch=\{false\}/);
});

test("ALIS validation and first-install guard use short-lived warm-instance caches",async()=>{
 const storage=await read("../.alis/license-edge-storage.js");
 const proxy=await read("../src/proxy.ts");
 assert.match(storage,/RECORD_CACHE_MS = 60000/);
 assert.match(proxy,/USER_COUNT_CACHE_MS=60000/);
 assert.match(storage,/validation_metadata/);
});

test("Staff Portal records timing for licensing, bootstrap and shared authentication stages",async()=>{
 const proxy=await read("../src/proxy.ts");
 const layout=await read("../src/app/admin/layout.tsx");
 assert.match(proxy,/stage=license/);
 assert.match(proxy,/stage=first-install/);
 assert.match(layout,/stage=session/);
 assert.match(layout,/stage=membership-permissions/);
});

test("Generic Staff Portal sections lazy-load action components instead of bundling every workflow",async()=>{
 const page=await read("../src/app/admin/[section]/page.tsx");
 assert.match(page,/import dynamic from "next\/dynamic"/);
 assert.match(page,/dynamic\(\(\)=>import\("@\/components\/admin-record-actions"\)\)/);
 assert.match(page,/dynamic\(\(\)=>import\("@\/components\/admin-website-editor"\)\)/);
 assert.doesNotMatch(page,/^import Admin(?:RecordActions|JobTools|QuoteManagement|CreateQuote|CreateJob|QuoteTools|CreateInvoice|InvoicePayment|InvoiceIssue|InvoiceExport|WebsiteEditor|CustomerResetLink|CustomerEmailVerification|CreateCustomer|CreateSupplier|SupplierActions|CreateAppointment|AccessDenied) from/m);
});

test("Appointments and their linked Workcards load concurrently",async()=>{
 const page=await read("../src/app/admin/[section]/page.tsx");
 assert.match(page,/const \[recordResult,workcardResult\]=await Promise\.all\(/);
 assert.match(page,/section==="appointments"/);
});

test("Quote register resolves linked enquiry details in one query",async()=>{
 const page=await read("../src/app/admin/quotes/page.tsx");
 assert.match(page,/enquiries!quotes_enquiry_id_fkey\(id,request_number,contact_name,requested_service\)/);
 assert.doesNotMatch(page,/enquiryIds=.*new Set/);
});
