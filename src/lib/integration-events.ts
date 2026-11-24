/** Stable business-event names that installed server-side modules may subscribe to. */
export const CORE_INTEGRATION_EVENTS = {
  ACCOUNT_PASSWORD_RESET_REQUESTED: "account.password_reset_requested",
  ACCOUNT_PASSWORD_CHANGED: "account.password_changed",
  ACCOUNT_INVITATION_CREATED: "account.invitation_created",
  STAFF_INVITATION_CREATED: "staff.invitation_created",
  CUSTOMER_ACCOUNT_CREATED: "customer.account_created",
  ENQUIRY_RECEIVED: "enquiry.received",
  QUOTE_ISSUED: "quote.issued",
  QUOTE_ACCEPTED: "quote.accepted",
  QUOTE_DECLINED: "quote.declined",
  QUOTE_CHANGES_REQUESTED: "quote.changes_requested",
  BOOKING_REQUESTED: "booking.requested",
  BOOKING_CONFIRMED: "booking.confirmed",
  BOOKING_RESCHEDULED: "booking.rescheduled",
  BOOKING_CANCELLED: "booking.cancelled",
  JOB_ASSIGNED: "job.assigned",
  JOB_STARTED: "job.started",
  JOB_COMPLETED: "job.completed",
  JOB_CUSTOMER_APPROVAL_REQUESTED: "job.customer_approval_requested",
  JOB_CUSTOMER_APPROVED: "job.customer_approved",
  JOB_CUSTOMER_CHANGES_REQUESTED: "job.customer_changes_requested",
  INVOICE_ISSUED: "invoice.issued",
  PAYMENT_RECEIVED: "payment.received",
  PAYMENT_REFUNDED: "payment.refunded",
  INVOICE_CREDIT_ISSUED: "invoice.credit_issued",
  SUPPLIER_ORDER_PLACED: "supplier_order.placed",
  SUPPLIER_ORDER_DELAYED: "supplier_order.delayed",
  REVIEW_REQUESTED: "review.requested"
} as const;

export type CoreIntegrationEvent = typeof CORE_INTEGRATION_EVENTS[keyof typeof CORE_INTEGRATION_EVENTS];
export const CORE_INTEGRATION_EVENT_NAMES = Object.values(CORE_INTEGRATION_EVENTS) as CoreIntegrationEvent[];
