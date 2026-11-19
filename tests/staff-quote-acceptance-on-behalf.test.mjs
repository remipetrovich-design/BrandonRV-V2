import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
test("staff quote acceptance control is available on quotes and Workcard",()=>{
 const quotePage=readFileSync(new URL("../src/app/admin/quotes/page.tsx",import.meta.url),"utf8");
 const workcard=readFileSync(new URL("../src/components/admin-workcard-management.tsx",import.meta.url),"utf8");
 assert.match(quotePage,/QuoteAcceptOnBehalf quoteId=\{q\.id\}/);
 assert.match(workcard,/QuoteAcceptOnBehalf quoteId=\{job\.quotes\.id\}/);
});
test("staff can create and manage bookings directly from the Workcard",()=>{
 const workcard=readFileSync(new URL("../src/components/admin-workcard-management.tsx",import.meta.url),"utf8");
 const bookingRoute=readFileSync(new URL("../src/app/api/admin/jobs/[id]/booking/route.ts",import.meta.url),"utf8");
 assert.match(workcard,/\["booking","Booking"\]/);
 assert.match(workcard,/async function createBooking\(\)/);
 assert.match(workcard,/\/api\/admin\/jobs\/\+jobId\+\/booking/);
 assert.match(workcard,/Agree a booking with customer/);
 assert.match(bookingRoute,/authorizePermission\("appointments\.manage"\)/);
 assert.match(bookingRoute,/update_jobcard_booking/);
});
