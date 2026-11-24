/** Stable event names that optional server-side modules may subscribe to. */
export const CORE_INTEGRATION_EVENTS={
 ACCOUNT_PASSWORD_RESET_REQUESTED:"account.password_reset_requested",
 ACCOUNT_INVITATION_CREATED:"account.invitation_created",
 STAFF_INVITATION_CREATED:"staff.invitation_created",
 ENQUIRY_RECEIVED:"enquiry.received",
 QUOTE_ISSUED:"quote.issued",
 INVOICE_ISSUED:"invoice.issued",
 BOOKING_CONFIRMED:"booking.confirmed"
} as const;
export type CoreIntegrationEvent=typeof CORE_INTEGRATION_EVENTS[keyof typeof CORE_INTEGRATION_EVENTS];
export const CORE_INTEGRATION_EVENT_NAMES=Object.values(CORE_INTEGRATION_EVENTS) as CoreIntegrationEvent[];
