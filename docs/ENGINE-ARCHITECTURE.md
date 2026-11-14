# Brandon RV V2 — Engine and Application Architecture

## Application shape

Brandon RV V2 is one application with two portal areas:
- Main Website and Customer Portal.
- Employee / Business Portal.

Both portals use the same application services and the same dedicated V2 Supabase project. Access is controlled by the existing identity, role and permission system. The four engines below are logical groupings for organising work; they are not separate deployments, microservices or databases.

## Four logical engines

### 1. Core Foundation
Shared capabilities used by every other area:
- One canonical user identity and account/session handling.
- Employee access, roles and permissions.
- Business settings and shared operating policies.
- Shared validation, security boundaries and audit history.

Reuse the existing `users`, `user_roles`, `user_role_permissions`, `user_permission_grants`, `businesses`, `business_settings` and `audit_events` structures. Do not create parallel identity, permissions or audit systems.

### 2. Job Management
The customer and commercial record lifecycle:
- Customers and vehicles.
- Enquiries and the original customer Jobcard.
- Quotes and separately retained revisions.
- Appointments/bookings.
- Workcards.
- Invoices and payments.
- Customer messages, attachments and history.

These remain separate records. The quote-request `enquiries` record is the original Jobcard identity. Quotes, appointments, Workcards, invoices and payments link to it through the existing relationships. The Jobcard page aggregates related records into one view; it does not embed them into one large record or create duplicate Jobcards.

### 3. Workshop Operations
The execution lifecycle of a Workcard:
- Setup review and approval.
- Employee assignment and acceptance.
- Work instructions and tasks.
- Actual labour, parts and time entries.
- Photos, attachments, tests and checks.
- Variations and customer approval.
- Worker sign-off, independent senior review and handover.

A Workcard is its own record (currently represented by `jobs` in the database). It links to the accepted quote and original Jobcard. The employee Workcard page is its operational workspace; the customer Jobcard page aggregates approved customer-visible results.

### 4. Business Operations
The supporting business administration:
- Business configuration and approved service catalogue.
- Service areas and booking policies.
- Supplier and procurement functions.
- Workforce and HR functions.
- Financial administration and reconciliation.
- Notifications, dashboards and reports.

Keep existing supplier and workforce features. Their presence in the application does not make them launch blockers. Implement their workflows in priority order without deleting modules or assuming supplier accounts, prices, GST settings or employment arrangements that have not been confirmed.

## External integration: OrbitFS License Manager

The License Manager is an existing external module and remains the licensing authority. Brandon RV uses the already-integrated module/API. Licence validation and enforcement are handled by the License Manager through its own API. Do not create a Brandon RV licensing engine, duplicate licence records or reproduce enforcement rules in the business application. Licensing work is deferred unless a specific integration issue is identified.

## Shared infrastructure

- **GitHub:** source control and version history for `remipetrovich-design/BrandonRV-V2`.
- **Vercel:** application hosting/runtime when deployment is configured.
- **Supabase:** the dedicated V2 PostgreSQL database, authentication resources and private file storage.

Use one application, one V2 repository and one dedicated V2 Supabase project. Do not create one server or database per logical engine. Keep V1 completely separate.

## Non-negotiable data and delivery rules

- Reuse existing records, migrations, routes, components, policies and domain logic where they satisfy the requirement.
- Upgrade and connect existing functionality; do not replace working modules or create fake controls/features.
- The Jobcard is the customer-facing master record; the Workcard is the staff execution record. They are distinct and linked.
- A specific accepted standard quote creates exactly one Workcard. Retries must not create duplicates.
- Booking is a separate record and must not create a duplicate Jobcard or Workcard.
- Preserve customer, vehicle, quote, job, invoice, payment, attachment and audit history.
- Keep service/pricing and GST placeholders until Chris confirms them. Supplier relationships remain unconfirmed.
- No production deployment without explicit instruction. Do not inspect or modify V1. Do not resume the paused mail system.
- Stage 8 full testing/hardening requires explicit permission. Run only focused checks appropriate to each implementation change until authorised.
