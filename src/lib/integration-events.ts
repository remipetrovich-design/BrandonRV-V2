/** Event contracts registered by Brandon RV V2 itself. */
export const CORE_INTEGRATION_EVENTS = {
 ACCOUNT_PASSWORD_RESET_REQUESTED:"account.password_reset_requested",ACCOUNT_PASSWORD_CHANGED:"account.password_changed",STAFF_INVITATION_CREATED:"staff.invitation_created",CUSTOMER_ACCOUNT_CREATED:"customer.account_created",ENQUIRY_RECEIVED:"enquiry.received",QUOTE_ISSUED:"quote.issued",QUOTE_ACCEPTED:"quote.accepted",QUOTE_DECLINED:"quote.declined",QUOTE_CHANGES_REQUESTED:"quote.changes_requested",BOOKING_REQUESTED:"booking.requested",BOOKING_CONFIRMED:"booking.confirmed",BOOKING_RESCHEDULED:"booking.rescheduled",BOOKING_CANCELLED:"booking.cancelled",JOB_ASSIGNED:"job.assigned",JOB_STARTED:"job.started",JOB_COMPLETED:"job.completed",JOB_CUSTOMER_APPROVAL_REQUESTED:"job.customer_approval_requested",JOB_CUSTOMER_APPROVED:"job.customer_approved",JOB_CUSTOMER_CHANGES_REQUESTED:"job.customer_changes_requested",INVOICE_ISSUED:"invoice.issued",PAYMENT_RECEIVED:"payment.received",PAYMENT_REFUNDED:"payment.refunded",INVOICE_CREDIT_ISSUED:"invoice.credit_issued"
} as const;
export type CoreIntegrationEvent=typeof CORE_INTEGRATION_EVENTS[keyof typeof CORE_INTEGRATION_EVENTS];
export const CORE_INTEGRATION_EVENT_NAMES=Object.values(CORE_INTEGRATION_EVENTS) as CoreIntegrationEvent[];
export type IntegrationEventDefinition={name:string;description:string;trigger:string;sourceId:string;sourceName:string};
const details:Record<CoreIntegrationEvent,{description:string;trigger:string}>={
"account.password_reset_requested":{description:"A user requests a password reset.",trigger:"When the password recovery workflow creates a reset request."},
"account.password_changed":{description:"A user's account password is changed.",trigger:"When the password update workflow completes successfully."},
"staff.invitation_created":{description:"A staff member is invited to the business.",trigger:"When a staff invitation is created and stored."},
"customer.account_created":{description:"A new customer account is created.",trigger:"When customer account registration completes."},
"enquiry.received":{description:"A new customer enquiry is received.",trigger:"When an enquiry is accepted by the application."},
"quote.issued":{description:"A quote is issued to a customer.",trigger:"When a quote is issued or sent."},
"quote.accepted":{description:"A customer accepts a quote.",trigger:"When a quote status changes to accepted."},
"quote.declined":{description:"A customer declines a quote.",trigger:"When a quote status changes to declined."},
"quote.changes_requested":{description:"A customer requests changes to a quote.",trigger:"When requested quote changes are recorded."},
"booking.requested":{description:"A customer requests a booking.",trigger:"When a booking request is submitted."},
"booking.confirmed":{description:"A booking is confirmed.",trigger:"When a booking status changes to confirmed."},
"booking.rescheduled":{description:"A booking is rescheduled.",trigger:"When a booking's scheduled date or time changes."},
"booking.cancelled":{description:"A booking is cancelled.",trigger:"When a booking status changes to cancelled."},
"job.assigned":{description:"A job is assigned to staff.",trigger:"When a job assignment is saved."},
"job.started":{description:"Work on a job begins.",trigger:"When a job is marked as started."},
"job.completed":{description:"A job is marked complete.",trigger:"When a job is marked as completed."},
"job.customer_approval_requested":{description:"A completed job is sent for customer approval.",trigger:"When customer approval is requested for a job."},
"job.customer_approved":{description:"A customer approves completed work.",trigger:"When a customer approval is recorded."},
"job.customer_changes_requested":{description:"A customer requests changes to completed work.",trigger:"When a customer submits a change request for a job."},
"invoice.issued":{description:"An invoice is issued to a customer.",trigger:"When an invoice is issued."},
"payment.received":{description:"A payment is received.",trigger:"When a payment is recorded as received."},
"payment.refunded":{description:"A payment is refunded.",trigger:"When a refund is recorded."},
"invoice.credit_issued":{description:"A credit is issued against an invoice.",trigger:"When an invoice credit is created."}
};
export const CORE_INTEGRATION_EVENT_DEFINITIONS:IntegrationEventDefinition[]=CORE_INTEGRATION_EVENT_NAMES.map(name=>({...details[name],name,sourceId:"brandonrv-v2",sourceName:"BrandonRV V2"}));
