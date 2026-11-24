# Brandon RV V2 Mail System integration

Mail System owns the Mail module source, its sending/receiving infrastructure, domains, mailboxes, provider credentials, transport, delivery processing and central delivery logs. The module is maintained in the Mail System repository and installed into Brandon RV V2 through this integration adapter.

Brandon RV, registered as an External System, owns all Brandon RV business data and application configuration: customer/staff records, business settings, templates and revisions, event triggers, recipient mappings, sender-selection rules, module activation and appearance. These records live in the Brandon RV V2 database. Mail System does not become a second store for Brandon RV customers, quotes, bookings, jobs or invoice data.

The V2 adapter connects to Mail System using a dedicated External System API key. The key is encrypted by the V2 Integrations Manager and is only read by server-side code. Use `mail:send` for normal least-privilege operation. `mail:admin` is also accepted, but is privileged and grants system-wide mailbox administration and sender discovery. Mail System validates the External System and mailbox assignment on every send.

## Configuration

The Mail System integration owns its Staff Portal administration page at `/admin/integrations/mail-system`. The page component, console, HTML editor, image-upload action, persistence adapter and module logic all live inside `integrations/Mail-system`. The generic Staff Portal integration host discovers the page from `integration.json` and adds its navigation entry only while the Integrations Manager row is enabled. Disabling the integration removes the navigation entry, makes the route return not-found, rejects all Mail System admin actions and stops event dispatch.

The page manages templates and revision history, full HTML email composition, image uploads, rendered previews, sender routes, event triggers, recipient mappings, module settings and appearance. The separate `Automated email sending enabled` setting is an additional send-safety switch; it does not control whether the integration page is installed or visible.

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

Mail System receives inbound mail and owns mailbox storage, routing and processing. The recommended Brandon RV integration key is send-only (`mail:send`): inbound replies remain in Mail System mailboxes and are not yet synchronised into Brandon RV records. `mail:admin` is supported only when system-wide mailbox administration is explicitly required; it is not an inbound synchronisation mechanism. A scoped inbound webhook/read contract is a separate integration step.

## Files

- integration.json: V2 Integrations Manager manifest and event subscriptions.
- server.cjs: server-only adapter between V2 business events and Mail System.
- console.tsx, types.ts, configuration.ts, supabase-store.ts: installed configuration console and V2-owned persistence.
- schema.sql, supabase-functions.sql: host database schema and revision functions.
