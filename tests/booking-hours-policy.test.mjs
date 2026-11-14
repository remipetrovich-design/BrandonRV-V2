import test from "node:test";
import assert from "node:assert/strict";
import { bookingHoursError } from "../src/lib/booking-hours-policy.mjs";

const settings={booking:{opening_time:"08:00",closing_time:"17:00",appointment_duration_minutes:60}};

test("allows bookings inside configured local operating hours",()=>{
 assert.equal(bookingHoursError(new Date("2026-11-16T00:00:00Z"),null,settings),null);
});

test("rejects bookings before opening or when configured duration ends after closing",()=>{
 assert.match(bookingHoursError(new Date("2026-11-16T21:30:00Z"),null,settings)??"",/operating hours/i);
 assert.match(bookingHoursError(new Date("2026-11-16T05:30:00Z"),null,settings)??"",/operating hours/i);
});

test("rejects an incomplete or invalid opening-hours configuration",()=>{
 assert.match(bookingHoursError(new Date("2026-11-16T00:00:00Z"),null,{booking:{opening_time:"08:00"}})??"",/both opening and closing/i);
 assert.match(bookingHoursError(new Date("2026-11-16T00:00:00Z"),null,{booking:{opening_time:"25:00",closing_time:"17:00"}})??"",/valid 24-hour/i);
});

test("does not impose operating hours when neither time has been configured",()=>{
 assert.equal(bookingHoursError(new Date("2026-11-16T00:00:00Z"),null,{booking:{}}),null);
});
