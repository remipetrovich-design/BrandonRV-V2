import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
const read=path=>readFile(new URL("../"+path,import.meta.url),"utf8");

test("staff Workcard attachments are signed concurrently and related records load in parallel",async()=>{
 const route=await read("src/app/api/staff/jobs/route.ts");
 assert.match(route,/Promise\.all\(\[\s*appointmentQuery\s*,\s*attachmentQuery\s*\]\)/);
 assert.match(route,/Promise\.all\(\(jobcardFiles\?\?\[\]\)\.map/);
 assert.doesNotMatch(route,/for\s*\(const file of jobcardFiles\?\?\[\]\)\s*\{\s*const \{data:signed\}=await db\.storage/);
});

test("staff Workcard actions do not refetch the entire assignment list after every save",async()=>{
 const component=await read("src/components/staff-work-orders.tsx");
 assert.doesNotMatch(component,/setNotice\("Workcard updated\."\);await load\(\);/);
});

test("admin Workcard saves do not trigger a redundant full server-component refresh",async()=>{
 const component=await read("src/components/admin-workcard-management.tsx");
 assert.doesNotMatch(component,/setNotice\("Workcard updated\."\);router\.refresh\(\);/);
 assert.doesNotMatch(component,/await load\(\);setActiveTab\("booking"\);router\.refresh\(\);/);
});

test("quote override checks are lazy instead of issuing one request for every quote row",async()=>{
 const component=await read("src/components/quote-approval-override.tsx");
 const page=await read("src/app/admin/quotes/page.tsx");
 assert.doesNotMatch(component,/useEffect\(/);
 assert.match(component,/onToggle=\{event=>\{if\(event\.currentTarget\.open&&!loaded&&!busy\)void load\(\);\}\}/);
 assert.match(page,/q\.status==="sent"&&q\.quote_kind==="standard"&&!q\.customer_approval_bypassed_at&&<QuoteApprovalOverride/);
});

test("enquiry detail only loads quote and booking registers for quote requests and fetches related data concurrently",async()=>{
 const page=await read("src/app/admin/enquiries/[id]/page.tsx");
 const editor=await read("src/components/admin-enquiry-editor.tsx");
 assert.match(page,/requestType=\{item\.request_type\}/);
 assert.match(editor,/requestType==="quote_request"&&canManageQuotes\?fetch\("\/api\/admin\/quotes"/);
 assert.match(editor,/requestType==="quote_request"&&\(canViewBookings\|\|canManageBookings\)\?fetch\("/);
 assert.match(editor,/const \[r,qr,br\]=await Promise\.all\(requests\)/);
 assert.match(editor,/Promise\.all\(\[r\.json\(\),qr\?qr\.json\(\):Promise\.resolve\(null\),br\?br\.json\(\):Promise\.resolve\(null\)\]\)/);
});

test("quote creation updates its local register instead of refetching every quote and enquiry",async()=>{
 const component=await read("src/components/admin-create-quote.tsx");
 assert.match(component,/setPriorQuotes\(current=>\[\{\.\.\.d\.quote,status:"draft",quote_kind:"standard"/);
 assert.doesNotMatch(component,/const refreshed=await fetch\("\/api\/admin\/quotes"/);
});
