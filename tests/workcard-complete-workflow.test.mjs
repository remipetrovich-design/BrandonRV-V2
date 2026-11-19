import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
const read=path=>readFile(new URL(path,import.meta.url),"utf8");

test("Workcard has a working Job details panel",async()=>{
 const component=await read("../src/components/admin-workcard-management.tsx");
 assert.match(component,/activeTab==="job"&&<section/);
 assert.match(component,/Job details/);
 assert.match(component,/Workcard title/);
 assert.match(component,/Approved scope \/ work requested/);
});

test("service catalogue selection is a category and never replaces the actual work item",async()=>{
 const component=await read("../src/components/admin-workcard-management.tsx");
 assert.match(component,/Service preset category \/ type of work/);
 assert.match(component,/Actual work item description/);
 assert.match(component,/Category:/);
 assert.doesNotMatch(component,/description:s\?\.name/);
});

test("Jobcard owns booking creation, confirmation, rescheduling and cancellation",async()=>{
 const editor=await read("../src/components/admin-enquiry-editor.tsx");
 const route=await read("../src/app/api/admin/enquiries/[id]/booking/route.ts");
 const migration=await read("../supabase/migrations/20261117230000_workcard_customer_approval_invoice_issue.sql");
 assert.match(editor,/brv-tab-booking/);
 assert.match(editor,/updateBooking\(appointmentId:string,action:/);
 assert.match(editor,/Confirm booking/);
 assert.match(editor,/Reschedule booking/);
 assert.match(editor,/Cancel booking/);
 assert.match(route,/authorizePermission\("appointments\.manage"\)/);
 assert.match(route,/sameOrigin\(request\)/);
 assert.match(route,/rpc\("update_jobcard_booking"/);
 assert.match(route,/p_action/);
 assert.match(route,/bookingWindowsConflict/);
 assert.match(route,/validateBookingWindow/);
 assert.match(migration,/workcard\.booking_'\|\|p_action/);
});

test("master calendar creates confirmed appointments against an existing Workcard",async()=>{
 const page=await read("../src/app/admin/[section]/page.tsx");
 const component=await read("../src/components/admin-create-appointment.tsx");
 const route=await read("../src/app/api/admin/appointments/route.ts");
 assert.match(page,/section==="appointments"&&canManageAppointments&&<AdminCreateAppointment/);
 assert.match(page,/linkedWorkcard/);
 assert.match(component,/Create & confirm appointment/);
 assert.match(component,/api/);
 assert.match(route,/appointments\.manage/);
 assert.match(route,/validateBookingWindow/);
 assert.match(route,/bookingWindowsConflict/);
 assert.match(route,/rpc\("update_jobcard_booking"/);
 assert.match(route,/p_action:"confirm"/);
 assert.match(route,/p_bypass_conflicts:bypassRestrictions/);
 assert.doesNotMatch(route,/from\("jobs"\)\.update/);
});

test("master calendar changes synchronise the linked Workcard while Workcard remains display-only",async()=>{
 const route=await read("../src/app/api/admin/[section]/[id]/route.ts");
 const editor=await read("../src/components/admin-enquiry-editor.tsx");
 const workcard=await read("../src/components/admin-workcard-management.tsx");
 const migration=await read("../supabase/migrations/20261117230000_workcard_customer_approval_invoice_issue.sql");
 assert.match(route,/rpc\("update_jobcard_booking"/);
 assert.match(route,/p_action:update\.status==="confirmed"\?"confirm":"reschedule"/);
 assert.match(route,/p_action:"cancel"/);
 assert.doesNotMatch(route,/workcard\.booking_synced_from_calendar/);
 assert.match(migration,/UPDATE public\.jobs/);
 assert.match(editor,/href="\/admin\/appointments"/);
 assert.match(workcard,/job\.appointments\?\.starts_at/);
 assert.match(workcard,/job\.appointments\?\.location/);
 assert.doesNotMatch(workcard,/createBooking|BOOKING MANAGEMENT|activeTab==="booking"/);
});

test("booking policy keeps notice, working-day, unavailable-date and advance limits but does not restrict operating hours",async()=>{
 const helper=await read("../src/lib/booking-rules.ts");
 assert.match(helper,/booking_notice_hours/);
 assert.match(helper,/working_days/);
 assert.match(helper,/unavailable_dates/);
 assert.match(helper,/opening_time|closing_time/);
 assert.match(helper,/bookingHoursError/);
 assert.match(helper,/maximum_advance_days/);
 assert.match(helper,/travel_buffer_minutes/);
});
