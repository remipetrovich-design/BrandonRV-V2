# Brandon RV V2 Mail System integration

Mail System owns the Mail module source, its sending/receiving infrastructure, domains, mailboxes, provider credentials, transport, delivery processing and central delivery logs. The module is maintained in the Mail System repository and installed into Brandon RV V2 through this integration adapter.

Brandon RV, registered as an External System, owns all Brandon RV business data and application configuration: customer/staff records, business settings, templates and revisions, event triggers, recipient mappings, sender-selection rules, module activation and appearance. These records live in the Brandon RV V2 database. Mail System does not become a second store for Brandon RV customers, quotes, bookings, jobs or invoice data.

The V2 adapter connects to Mail System using a dedicated External System API key. The key is encrypted by the V2 Integrations Manager and is only read by server-side code. Mail System validates the External System and mailbox assignment on every send.

## Configuration

The Business Settings page exposes the Mail System console when the integration is enabled. It manages templates, revisions, sender routes, event triggers, recipient mappings, module settings and appearance. The integration manager's enable switch and the module's own enable switch are separate; automated sends require both to be enabled and an active event trigger/template.

The current event catalogue contains only events emitted by existing Brandon RV V2 workflows. The integration manifest and integration-events source must stay aligned. Each event payload uses trusted server-side context and a recipient.email path for its primary recipient.

## Current event coverage

- Account password reset and password changed.
- Staff invitation created and customer account created.
- Public, quote-request and customer-portal enquiries received.
- Quote issued, accepted, declined and senior-review changes requested.
- Booking requested, confirmed, rescheduled and cancelled.
- Workcard assigned, started, completed, awaiting customer approval, approved and changes requested.
- Invoice issued, payment received, payment refunded and credit note issued.

Supplier-order emails, scheduled booking reminders, review requests and inbound-reply-to-business-workflow automation are not yet emitted by V2. They must not be configured as live triggers until their source workflows and delivery paths are implemented.

## Receiving email

Mail System receives inbound mail and owns mailbox storage, routing and processing. The current Brandon RV integration key is send-only (mail:send): inbound replies remain in Mail System mailboxes and are not yet synchronised into Brandon RV records. A scoped inbound webhook/read contract is a separate integration step; do not grant broad mailbox access to Brandon RV to work around this.

## Files

- integration.json: V2 Integrations Manager manifest and event subscriptions.
- server.cjs: server-only adapter between V2 business events and Mail System.
- console.tsx, types.ts, configuration.ts, supabase-store.ts: installed configuration console and V2-owned persistence.
- schema.sql, supabase-functions.sql: host database schema and revision functions.
