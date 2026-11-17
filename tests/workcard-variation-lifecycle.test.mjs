import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
const source=path=>readFile(new URL(path,import.meta.url),"utf8");

test("guest quote portal securely supports standard quotes and Workcard variations",async()=>{
 const route=await source("../src/app/api/tickets/[id]/quote-response/route.ts");
 const ui=await source("../src/components/guest-request-workspace.tsx");
 const page=await source("../src/app/request-status/page.tsx");
 const messages=await source("../src/app/api/tickets/[id]/messages/route.ts");
 assert.match(route,/guest_access_token_hash/);
 assert.match(route,/quote_kind/);
 assert.match(route,/respond_to_guest_job_variation/);
 assert.match(route,/respond_to_guest_quote/);
 assert.match(ui,/q\.quote_kind==="variation"/);
 assert.match(ui,/Variation approved/);
 assert.match(ui,/Variation declined/);
 assert.match(route,/guestToken/);
 assert.doesNotMatch(route,/appointments/);
 assert.match(ui,/TicketConversation/);
 assert.match(page,/Review and respond to quotes, or message Brandon RV/);
 assert.match(messages,/public_enquiry.*general_enquiry.*customer_enquiry.*quote_request/);
});

test("guest booking and final Workcard approval remain denied server-side",async()=>{
 const booking=await source("../src/app/api/tickets/[id]/booking-request/route.ts");
 const workOrder=await source("../src/app/api/tickets/[id]/work-order/route.ts");
 assert.match(booking,/return jsonError\("Guest access is limited to quote responses and general enquiry messages/);
 assert.match(workOrder,/return jsonError\("Guest access is limited to quote responses and general enquiry messages/);
});

test("guest standard quote and variation responses use separate transactional database functions",async()=>{
 const route=await source("../src/app/api/tickets/[id]/quote-response/route.ts");
 const baseMigration=await source("../supabase/migrations/20261117180000_quote_revision_issue_lifecycle.sql");
 const variationMigration=await source("../supabase/migrations/20261117200000_workcard_variation_customer_access.sql");
 assert.match(route,/quote_kind==="variation"\?"respond_to_guest_job_variation":"respond_to_guest_quote"/);
 assert.match(baseMigration,/CREATE OR REPLACE FUNCTION public\.respond_to_guest_quote/);
 assert.match(variationMigration,/CREATE OR REPLACE FUNCTION public\.respond_to_guest_job_variation/);
 assert.match(variationMigration,/guest_access_token_hash/);
 assert.match(variationMigration,/guest_access_expires_at/);
});

test("Workcard variations require an active approved Workcard and valid customer access",async()=>{
 const route=await source("../src/app/api/admin/jobs/[id]/variations/route.ts");
 const migration=await source("../supabase/migrations/20261117200000_workcard_variation_customer_access.sql");
 assert.match(route,/active, setup-approved Workcard/);
 assert.match(route,/\.eq\("quote_kind","standard"\)/);
 assert.match(route,/guest_access_token_hash/);
 assert.match(route,/Guest customer secure access has expired/);
 assert.match(migration,/CREATE OR REPLACE FUNCTION public\.issue_job_variation_quote/);
 assert.match(migration,/respond_to_guest_job_variation/);
});

test("admin Workcard entries cannot bypass customer-approved variations after work starts",async()=>{
 const route=await source("../src/app/api/admin/jobs/[id]/work-entries/route.ts");
 assert.match(route,/job\.status==="in_progress"&&\["labour","parts"\]/);
 assert.match(route,/Additional labour or parts must be added through an approved Workcard variation/);
 assert.match(route,/Additional scope, approved quantities and customer charges must be changed through an approved Workcard variation/);
 assert.match(route,/quantityUsed>quantityRequired/);
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
