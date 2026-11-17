import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
const source=path=>readFile(new URL(path,import.meta.url),"utf8");

test("guest quote portal exposes quote requests and secure variation decisions without booking access",async()=>{
 const route=await source("../src/app/api/tickets/[id]/quote-response/route.ts");
 const ui=await source("../src/components/guest-request-workspace.tsx");
 const page=await source("../src/app/request-status/page.tsx");
 const messages=await source("../src/app/api/tickets/[id]/messages/route.ts");
 const migration=await source("../supabase/migrations/20261117200000_workcard_variation_customer_access.sql");
 assert.match(route,/guest_access_token_hash/);
 assert.match(route,/respond_to_guest_job_variation/);
 assert.doesNotMatch(route,/appointments/);
 assert.match(ui,/Variation approved/);
 assert.match(ui,/TicketConversation/);
 assert.match(page,/Review and respond to quotes, or message Brandon RV/);
 assert.match(messages,/public_enquiry.*general_enquiry.*customer_enquiry.*quote_request/);
 assert.match(migration,/CREATE OR REPLACE FUNCTION public\\.respond_to_guest_job_variation/);
});

test("guest booking and Workcard endpoints are denied server-side",async()=>{
 const booking=await source("../src/app/api/tickets/[id]/booking-request/route.ts");
 const workOrder=await source("../src/app/api/tickets/[id]/work-order/route.ts");
 assert.match(booking,/return jsonError\("Guest access is limited to quote responses and general enquiry messages/);
 assert.match(workOrder,/return jsonError\("Guest access is limited to quote responses and general enquiry messages/);
});

test("guest quote decisions preserve secure enquiry access while variations use their own lifecycle",async()=>{
 const migration=await source("../supabase/migrations/20261117200000_workcard_variation_customer_access.sql");
 const guestQuote=await source("../supabase/migrations/20261111110000_atomic_guest_quote_response.sql");
 const route=await source("../src/app/api/tickets/[id]/quote-response/route.ts");
 assert.ok(guestQuote.includes("CREATE OR REPLACE FUNCTION public.respond_to_guest_quote"));
 assert.ok(migration.includes("CREATE OR REPLACE FUNCTION public.respond_to_guest_job_variation"));
 assert.ok(migration.includes("guest_access_token_hash"));
 assert.ok(route.includes("respond_to_guest_job_variation"));
 assert.ok(route.includes("respond_to_guest_quote"));
});

test("Workcard variations support registered customers and guests with active secure access",async()=>{
 const route=await source("../src/app/api/admin/jobs/[id]/variations/route.ts");
 assert.match(route,/!job\\.user_id/);
 assert.match(route,/guest_access_token_hash/);
 assert.match(route,/Guest customer secure access has expired/);
 assert.match(route,/baseQuote\\.user_id/);
});

test("registered customers retain the dedicated variation lifecycle",async()=>{
 const route=await source("../src/app/api/portal/quotes/respond/route.ts");
 const migration=await source("../supabase/migrations/20261112110759_workcard_quote_variations.sql");
 const page=await source("../src/app/portal/jobcards/[id]/page.tsx");
 assert.match(route,/respond_to_job_variation/);
 assert.match(migration,/CREATE OR REPLACE FUNCTION public\.respond_to_job_variation/);
 assert.match(migration,/job_work_entries/);
 assert.match(page,/notice==="variation_declined"/);
});
