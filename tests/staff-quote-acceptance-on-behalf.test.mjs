import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

test("staff quote acceptance remains available on Quotes register and linked Workcard",()=>{
 const quotePage=readFileSync(new URL("../src/app/admin/quotes/page.tsx",import.meta.url),"utf8");
 const workcard=readFileSync(new URL("../src/components/admin-workcard-management.tsx",import.meta.url),"utf8");
 assert.match(quotePage,/QuoteAcceptOnBehalf quoteId=\{q\.id\}/);
 assert.match(workcard,/QuoteAcceptOnBehalf quoteId=\{job\.quotes\.id\}/);
});

test("Workcard displays booking details only and contains no booking-management actions",()=>{
 const workcard=readFileSync(new URL("../src/components/admin-workcard-management.tsx",import.meta.url),"utf8");
 assert.match(workcard,/WorkcardReadOnly/);
 assert.match(workcard,/job\.appointments\?\.starts_at/);
 assert.match(workcard,/job\.appointments\?\.location/);
 assert.doesNotMatch(workcard,/createBooking|BOOKING MANAGEMENT|brv-workcard-booking-manager|activeTab===\"booking\"|\/api\/admin\/jobs\/\+jobId\+\/booking/);
});

test("Jobcard owns booking creation, confirmation, rescheduling and cancellation",()=>{
 const jobcard=readFileSync(new URL("../src/components/admin-enquiry-editor.tsx",import.meta.url),"utf8");
 const bookingRoute=readFileSync(new URL("../src/app/api/admin/enquiries/[id]/booking/route.ts",import.meta.url),"utf8");
 assert.match(jobcard,/brv-tab-booking/);
 assert.match(jobcard,/selectedTab===\"booking\"/);
 assert.match(jobcard,/Confirm booking/);
 assert.match(jobcard,/Reschedule booking/);
 assert.match(jobcard,/Cancel booking/);
 assert.match(jobcard,/updateBooking\(appointmentId:string,action:\"confirm\"\|\"reschedule\"\|\"cancel\"\)/);
 assert.match(bookingRoute,/authorizePermission\(\"appointments\.manage\"\)/);
 assert.match(bookingRoute,/update_jobcard_booking/);
});
