const localParts = (date) => {
  const parts = new Intl.DateTimeFormat("en-AU", { timeZone: "Australia/Sydney", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(date);
  const value = type => parts.find(part => part.type === type)?.value ?? "";
  return { date: value("year") + "-" + value("month") + "-" + value("day"), minutes: Number(value("hour")) * 60 + Number(value("minute")) };
};
export function bookingHoursError(start, end, settings = {}) {
  const booking = settings?.booking ?? {};
  const opening = String(booking.opening_time ?? ""), closing = String(booking.closing_time ?? "");
  if (!opening && !closing) return null;
  if (!opening || !closing) return "Configure both opening and closing times before accepting bookings.";
  const validTime = value => /^([01]\\d|2[0-3]):[0-5]\\d$/.test(value);
  if (!validTime(opening) || !validTime(closing) || opening >= closing) return "Configure valid 24-hour opening and closing times before accepting bookings.";
  const startDate = start instanceof Date ? start : new Date(start);
  const duration = Number(booking.appointment_duration_minutes ?? 60);
  const endDate = end ? (end instanceof Date ? end : new Date(end)) : new Date(startDate.getTime() + duration * 60000);
  if (!Number.isFinite(startDate.getTime()) || !Number.isFinite(endDate.getTime()) || endDate <= startDate) return "Enter a valid booking time.";
  const localStart = localParts(startDate), localEnd = localParts(endDate);
  const openingMinutes = Number(opening.slice(0, 2)) * 60 + Number(opening.slice(3));
  const closingMinutes = Number(closing.slice(0, 2)) * 60 + Number(closing.slice(3));
  if (localStart.date !== localEnd.date || localStart.minutes < openingMinutes || localEnd.minutes > closingMinutes) return "That booking falls outside Brandon RV's configured operating hours.";
  return null;
}
