import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

test("staff quote acceptance remains available on Quotes register and linked Workcard",()=>{
 const quotePage=readFileSync(new URL("../src/app/admin/quotes/page.tsx",import.meta.url),"utf8");
 const workcard=readFileSync(new URL("../src/components/admin-workcard-management.tsx",import.meta.url),"utf8");
 assert.match(quotePage,/QuoteAcceptOnBehalf quoteId=\{q\.id\}/);
 assert.match(workcard,/QuoteAcceptOnBehalf quoteId=\{job\.quotes\.id\}/);
});

test("Workcard displays booking details without booking-management controls",()=>{
 const workcard=readFileSync(new URL("../src/components/admin-workcard-management.tsx",import.meta.url),"utf8");
 assert.match(workcard,/<span>Booking<\/span>/);
 assert.match(workcard,/<span>Service location<\/span>/);
 assert.doesNotMatch(workcard,/createBooking|booking-manager|activeTab==="booking"|bookingStart|bookingLocation|appointments\/booking/);
});

test("Jobcard owns booking creation, confirmation, rescheduling and cancellation",()=>{
 const jobcard=readFileSync(new URL("../src/components/admin-enquiry-editor.tsx",import.meta.url),"utf8");
 const bookingRoute=readFileSync(new URL("../src/app/api/admin/enquiries/[id]/booking/route.ts",import.meta.url),"utf8");
 assert.match(jobcard,/selectedTab==="booking"/);
 assert.match(jobcard,/async function updateBooking\(appointmentId:string,action:"confirm"\|"reschedule"\|"cancel"\)/);
 assert.match(jobcard,/type="datetime-local"/);
 assert.match(jobcard,/Confirm booking/);
 assert.match(jobcard,/Reschedule booking/);
 assert.match(jobcard,/Cancel booking/);
 assert.match(bookingRoute,/authorizePermission\("appointments\.manage"\)/);
 assert.match(bookingRoute,/update_jobcard_booking/);
});
