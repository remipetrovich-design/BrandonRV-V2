# Brandon RV V2 — Database Architecture

## Purpose and database boundary

This document describes the V2 logical data model in its dedicated Supabase project `Brandon-RV-V2` (`lciylmfpcefdpsouoqvm`, API URL `https://lciylmfpcefdpsouoqvm.supabase.co`). V2 uses the PostgreSQL `public` schema and compatibility views; it does not create a second PostgreSQL schema called `v2`, which would require changing every database client and API query.

V2 now has its own Supabase project, database, migration history, auth/storage resources and keys, separate from V1. The project was created in region `ap-northeast-1` (Tokyo). Never connect V2 to the old V1 project (`thkxalrsklgademwrrlq`) or apply V2 migrations there. All future V2 schema changes must be committed to this repository and applied only to `lciylmfpcefdpsouoqvm`.

## Current database snapshot

Inspected 15 November 2026 after initial V2 provisioning:
- 57 base tables in `public` and 3 compatibility views (`customers`, `profiles`, `staff`).
- All 57 base tables have Row Level Security enabled.
- One Brandon RV business/workspace seed record (`prelaunch`, Tamworth NSW).
- No customer, employee or operational records have been copied from V1.
- One private Storage bucket exists: `brandon-rv-private`.
- 64 migration records are applied, including the V2 RPC-permission security patch and the latest atomic Workcard update/deletion migrations.
- The database includes the enquiry, quote, booking, Workcard, job work detail, variations, approvals, workforce/HR, suppliers/procurement, invoice/payment, audit, notification, licensing and website structures.
- Email template schema and six default templates exist, but the external mail delivery system remains paused and has not been re-enabled.

All tables are RLS-enabled. Some internal/service-only tables intentionally have no user-facing RLS policies; their table grants are restricted to `service_role`, with no `anon` or `authenticated` table grants. This is a structural snapshot, not a claim that every workflow is production-ready.

## Canonical identity and staff model

### One identity record

`public.users` is the canonical identity table. Customers and employees are not separate account identities.

- `users.id` is the identity primary key.
- `customers` is a compatibility view over `users`.
- `staff` is a compatibility view over `users`.
- `user_sessions` owns authenticated application sessions.
- `user_invitations` and `staff_invitations` manage separate invitation workflows; keep their purpose clear and avoid creating a third invitation system.
- `user_roles` is the canonical role catalogue.
- `user_role_permissions` defines role permissions.
- `user_permission_grants` stores individual, reasoned, optionally expiring permission grants.
- `permissions` is the permission catalogue.

The current schema intentionally keeps a permanent customer identity while attaching employee fields to the same row. Employee-specific data is an optional add-on: `user_role`, `employment_status`, `employment_type`, title, dates and other employee details. The live constraints currently keep `account_type='customer'`, `primary_group='customer'` and `secondary_group` empty; staff access is granted through `user_role` and active employment status. Do not create a second password, login, or identity record for staff.

### Initial operating team

The initial internal operating team is two people: Chris as business owner and Lucas as technical/developer support. Customer accounts are not limited to two. The live V2 `public.users` table currently contains no user records. The initial owner and Website Developer accounts still need to be created through the supported account setup flow before role-based staff workflows can be exercised end to end. Do not create placeholder identities or invent account email addresses.

The system must remain capable of adding staff later, but launch workflows should not assume a large workforce, multiple departments, payroll processing, leave administration or complex HR approvals.

### Compatibility structures

`business_members`, `permission_groups`, `permission_group_permissions` and `member_permission_groups` are legacy/compatibility structures. Current application authorization in `src/lib/auth.ts` reads `user_roles`, `user_role_permissions` and `user_permission_grants`. Do not add new runtime authorization paths to the legacy group tables. Do not drop them while the database remains shared.

## Business and workflow relationships

### Business configuration
- `businesses` is the business/workspace root.
- `business_settings` stores configurable operating policies.
- `services` and `service_areas` are the configurable catalogue and service coverage.
- `site_pages` stores website pages and drafts.
- `email_templates` stores customer and operational message templates.

### Customer intake
- `users` is the customer identity.
- `vehicles` belongs to a customer identity and business.
- `enquiries` belongs to a business and may link to a customer, user and vehicle.
- `enquiry_attachments`, `enquiry_assignments` and `enquiry_stage_history` extend the enquiry record.
- `customer_messages` stores customer-facing and internal conversation history.

### Commercial workflow
- `quotes` belongs to a business and customer and may originate from an enquiry.
- `quote_items` belongs to a quote and may reference a configured service.
- Quote revisions remain separate quote records linked through revision/supersession fields.
- Variations use the existing quote/job relationship; do not create a parallel quote model.

### Booking and delivery
- `appointments` represents the customer booking/appointment.
- `jobs` is the canonical Workcard record. An accepted quote should create one Workcard.
- `job_assignments`, `job_tasks`, `job_work_entries`, `job_attachments` and `time_entries` extend the Workcard.
- Customer and supervisor sign-off fields remain on the Workcard until a separately justified normalisation is designed.

### Finance
- `invoices` belongs to a business and may link to a customer, quote and Workcard/job.
- `invoice_items` belongs to an invoice.
- `payments` belongs to an invoice and customer.
- `expenses` records business/job costs.
- Do not treat quotes, deposits, invoices, payments and expenses as interchangeable records.

### Security, audit and communications
- `audit_events` is the existing append-oriented audit history. Reuse it; do not create a duplicate audit table.
- `notifications` and `notification_preferences` manage in-app notifications.
- `documents` stores customer/job/quote/invoice document metadata.
- `application_license` stores the encrypted application licence state and is separate from customer/business workflow data.

## Current table inventory

| Area | Existing tables |
|---|---|
| Business | `businesses`, `business_settings` |
| Website/catalogue | `site_pages`, `services`, `service_areas` |
| Identity/access | `users`, `user_sessions`, `password_reset_tokens`, `email_verification_tokens`, `user_invitations`, `staff_invitations`, `user_roles`, `user_role_permissions`, `user_permission_grants`, `permissions`, `business_members`, `permission_groups`, `permission_group_permissions`, `member_permission_groups`, `login_attempts` |
| Customer intake | `vehicles`, `enquiries`, `enquiry_attachments`, `enquiry_assignments`, `enquiry_stage_history`, `customer_messages` |
| Quotes/bookings | `quotes`, `quote_items`, `appointments` |
| Workcards | `jobs`, `job_assignments`, `job_tasks`, `job_work_entries`, `job_attachments`, `time_entries` |
| Finance | `invoices`, `invoice_items`, `payments`, `expenses` |
| Workforce (optional/deferred) | `availability_blocks`, `attendance_entries`, `leave_types`, `leave_balances`, `leave_requests`, `employee_assets`, `hr_onboarding_tasks`, `payroll_periods`, `payroll_items` |
| Procurement (future) | `suppliers`, `supplier_orders`, `supplier_order_items` |
| Operations/comms | `audit_events`, `notifications`, `notification_preferences`, `email_templates`, `documents` |
| Licensing | `application_license` |

## Product and operating decisions

- Keep one canonical user identity and one optional employee profile on that identity.
- Use explicit role keys and permission keys. Do not rely on a display title such as “Supervisor” as the permission check itself.
- The approval rule remains Supervisors and above, implemented through explicit quote/job approval permissions.
- Chris must be able to manage routine business configuration without developer intervention.
- Keep all current features, including workforce/HR, supplier/procurement, customer portal and employee portal. Improve their integration and usability rather than deleting or hiding them.
- The initial operating team is two people, but the system must remain extensible for additional staff and suppliers.
- Service list/pricing and GST remain Chris-configured placeholders. Do not seed assumed prices or tax registration/rates.
- Parts, freight and deposit prepayment policies remain configurable in Business Settings.
- Supplier purchasing remains a later implementation priority, not a reason to remove supplier features.

## Stage 1 backend foundation

Complete in this order:

1. Standardise API input parsing and validation helpers without changing existing request contracts unnecessarily.
2. Standardise permission checks around the canonical role/permission model in `src/lib/auth.ts`.
3. Reuse `src/lib/audit-events.mjs` for all material writes; audit failures must not be silently ignored where the business action depends on an audit record.
4. Identify multi-record workflows that currently perform sequential writes and move those operations into database transactions/RPCs where partial completion would leave inconsistent business state.
5. Add idempotency only to mutation endpoints where retry/double-submit risk is material; define retention and replay behavior before adding the table/RPC.
6. Standardise API errors while retaining stable customer-facing messages and HTTP status behavior.
7. Add focused tests for shared helpers and the highest-risk mutation paths.

No new table is justified merely to duplicate existing users, staff, audit or membership records. Add a V2-specific table only after the application contract and data ownership are clear.

## Safety and rollout rules

- All schema changes are migration files committed to this V2 repository.
- Do not apply migrations to Supabase from this workflow.
- Do not delete or rewrite existing user, staff, customer, financial or audit records.
- Do not drop legacy compatibility objects while the Supabase project is shared with V1.
- Review foreign keys, RLS, grants and Data API exposure for every new table or function.
- Stage 8 full testing/hardening remains unauthorised until Lucas explicitly approves it.
