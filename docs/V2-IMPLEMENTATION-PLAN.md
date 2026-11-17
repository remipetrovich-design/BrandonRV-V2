# Brandon RV V2 — Implementation Plan

This is the active V2 implementation plan. Work only in `BrandonRV-V2`. Do not inspect or modify V1. Preserve the existing UI and the two portal areas: (1) Main Website with Customer Portal, and (2) Employee / Business Portal.

## Operating model
- Initial internal operating team: Chris (business owner) and Lucas (technical/developer support). Customer accounts are not limited to two.
- Keep one canonical identity in `public.users`; customer and employee access remain roles/extensions of that identity, not separate login systems.
- Keep the ability to add staff later. Existing workforce/HR features remain in the product, but payroll, leave and complex HR workflows are not launch dependencies.
- Supplier and purchasing capabilities remain in the product. Their full operational rollout can follow the core job workflow.
- Reuse existing modules, tables, routes, components, policies and domain logic wherever they already satisfy the requirement. Upgrade and connect them; do not create parallel systems or remove existing functionality to simplify the build.

## Application architecture
Brandon RV is one application, one V2 Supabase project and one repository. The following are logical groupings inside the application, not separately deployed services or separate databases:

1. **Core foundation** — canonical user identity, authentication/session handling, roles and permissions, business configuration, shared validation, security boundaries and audit history.
2. **Job Management** — customer and vehicle context, enquiries/Jobcards, quote records and revisions, appointments/bookings, Workcards, invoices and payments as separate linked records. The original quote-request enquiry is the Jobcard identity. The Jobcard view aggregates related records; it does not absorb or merge their data.
3. **Workshop Operations** — Workcard setup/review, assignments, worker acceptance, tasks, actual labour and parts, time, attachments, tests, variations, approvals, completion and handover.
4. **Business Operations** — business settings, service catalogue, service areas, supplier/procurement functions, workforce/HR functions, financial administration, notifications, dashboards and reports. Existing capabilities are retained; launch priority is based on the real business workflow.


## Record relationships and business workflow
- One quote request creates one original Jobcard using the existing `enquiries` record. Do not create a duplicate Jobcard table or record.
- Quotes, quote revisions, appointments/bookings, Workcards, invoices, payments, messages, attachments and history remain separate records with their own status and lifecycle.
- Each related record links back to the original Jobcard wherever the existing schema supports that relationship.
- The Jobcard screen aggregates the related records into one customer/job view. Opening a Workcard opens its own operational detail and provides a clear link back to the Jobcard.
- Acceptance of a specific standard quote revision creates exactly one Workcard. The existing atomic conversion RPC is reused; retries must return the existing Workcard.
- Booking remains a separate record and does not create another Jobcard or Workcard.
- Canonical workflow: enquiry/Jobcard → quote and revisions → customer acceptance → one Workcard → assignment and booking → work, parts and variations → worker and senior review → customer approval → invoice and payment → closeout/history.
- Do not assume every job needs a booking at the same point. Preserve the existing workflow rules and booking configuration.

## Infrastructure and operating boundaries
- V2 repository: `remipetrovich-design/BrandonRV-V2`, branch `main`.
- Supabase project: `Brandon-RV-V2` (`lciylmfpcefdpsouoqvm`), URL `https://lciylmfpcefdpsouoqvm.supabase.co`, region `ap-northeast-1` (Tokyo).
- V2 has its own database, migration history, auth/storage resources and keys. V1 (`thkxalrsklgademwrrlq`) remains separate and must not be inspected or modified.
- The dedicated V2 project records 83 applied migration versions as of 17 November 2026, including the invoice lifecycle and latest workflow migrations. No V1 data was copied. See [V2 Database Architecture](./V2-DATABASE-ARCHITECTURE.md).
- Commit all future V2 schema changes to this repository. Apply reviewed migrations to the dedicated V2 project in dependency order as part of implementation; never to V1.
- GitHub stores source and history; Vercel hosts/runs the application when configured; Supabase provides the database, authentication and storage. Keep one application and one V2 database. Use existing free-tier services and monitor their limits; do not add paid services without approval.
- Do not deploy to production unless explicitly requested.
- The mail delivery system remains paused. Do not resume or change it.
- Keep `.env.example` complete with variable names and placeholders only. Do not put real credentials in source control or ask for secrets in chat.
- Stage 8 (full testing/hardening) is not authorised. Focused tests, typecheck and build checks for individual changes remain part of normal development.

## Delivery priorities
1. **Reuse and reconcile the existing foundation** — inspect the current implementation and migrations; correct stale/conflicting documentation; preserve working functionality; standardise validation, permission checks, audit handling and error behavior where gaps are confirmed.
2. **Finish the Jobcard and commercial path** — complete and verify enquiry/Jobcard intake, quote creation/revisions/approval, customer acceptance/decline and the single atomic Workcard conversion.
3. **Finish Workshop Operations** — Workcard review, assignment and acceptance, booking link, tasks, actual work/parts/time, attachments, variations, worker sign-off, independent senior review and customer handover.
4. **Finish Business Operations and closeout** — invoice from approved actual work, payment recording, deposits/refunds, supplier/procurement flow, business settings, notifications and useful reports. Keep supplier setup configurable and do not invent supplier relationships.
5. **Connect and refine the portals** — ensure the public website/customer portal and employee/business portal present the same linked records with role-appropriate controls; retain existing design and improve consistency/usability.
6. **Operational verification before release** — focused regression checks during development. Full end-to-end testing/hardening remains Stage 8 and requires Lucas's explicit permission.

## Business decisions and placeholders
- Service list and pricing: “Placeholder 4 chris to fill later”.
- GST registration and rate: “Placeholder 4 chris to fill later”. Do not assume GST applies or invent a rate.
- Supplier names and ordering arrangements: “Future thing”.
- Supplier foundation: maintain supplier contact records and activation status using the existing `suppliers` table. Existing supplier-order and Workcard part-tracking records remain available, but supplier-specific API credentials, catalogues, order submission, status synchronisation, acknowledgements and automated receiving are explicitly deferred until the external supplier is selected and its integration method is known.
- Parts, freight and deposits paid before ordering: configurable in Business Settings; do not hardcode policy.
- Approval authority: Supervisors+.
- Do not promise job completion until critical parts and site access are confirmed.

## Verified implementation baseline and current gaps
- The accepted-quote → Workcard conversion uses `create_workcard_from_accepted_quote`, which locks the quote and creates the Workcard, planned work entries, Jobcard stage history and audit event in one database transaction. The route calls this RPC and returns the existing Workcard on a retry.
- The latest V2 structural snapshot (17 November 2026) includes 60 RLS-enabled public base tables, three compatibility views, a private storage bucket and 83 applied migration records. This is a structural snapshot, not proof that every feature is complete.
- The Workcard PATCH path calls `update_workcard_with_jobcard_stage`, a service-role-only database function that locks the Workcard and commits the Workcard update, linked Jobcard stage/history and audit event in one transaction. The migration is applied to V2; function privileges and fixed search path were verified, and a transactional smoke test passed. GitHub Actions run 143 passed tests, typecheck and build.
- The Workcard DELETE path now calls `delete_untouched_workcard`. The migration is applied to V2 and a database smoke test confirmed that the pending Workcard is deleted and its audit event is written; temporary test records were cleaned up. The function also blocks deletion when assignments, tasks, attachments, invoices, supplier orders, expenses, time entries or actual/invoiceable work exist. GitHub Actions run 146 passed all 246 tests, typecheck and build for the DELETE-route implementation.
- The admin invoice route calls `create_invoice_from_approved_workcard`. A live V2 inspection confirmed that the function is installed and its migration version `20261114201059` is applied; it locks the Workcard, checks the submitted lines against actual invoiceable Workcard entries, creates the draft invoice and invoice items, and writes the audit event in one transaction. The exact applied migration source is present on `main` as `20261114201059_create_invoice_from_approved_workcard_rpc.sql`.
- The invoice lifecycle migration is applied to V2 as version `20261117102142` (`invoice_issue_payment_credit_lifecycle_20261117220000`). It adds invoice issue metadata, refund and credit-note tables, payment idempotency, immutable issued-invoice triggers and five service-role-only lifecycle functions. Its exact SQL is present on `main` under the matching database version.
- Documentation must distinguish implemented code, partially implemented code, outstanding work and unverified runtime behavior. A database table, route or UI control alone does not establish that a complete workflow works.

## UI consistency implementation — 15 November 2026

The existing design system is being applied to the current route and component structure rather than replaced with a parallel UI system.

Completed in this pass:
- Restored the public website and customer portal to the documented warm-neutral, deep-green and orange brand register. Public display/body typography is Georgia/Arial.
- Kept the navy/blue operational register scoped to `.brv-admin-frame`, including its own tokens, density and workspace controls.
- Removed duplicate nested admin topbars from email templates, service areas and service catalogue pages; the shared AdminShell remains the single authenticated workspace header.
- Redirected legacy customer-enquiry, general-enquiry and quote-request admin URLs into the canonical Enquiries register with the correct filter.
- Standardised admin content wrappers and removed the extra blank portal-sidebar grid column from pages rendered inside AdminShell.
- Removed the hardcoded customer support phone and portal footer location; the customer sidebar now directs customers to the enquiry form.
- Improved public text accent contrast, workspace muted text contrast, keyboard focus treatment and reduced-motion support.

V2 is now deployed through the dedicated `brandon-rv-v2` Vercel project linked to this repository. The latest Production deployment was READY on 17 November 2026. The UI pass changes presentation and route consolidation only; existing business logic and database workflows were retained.

Verification: GitHub Actions runs 166–183 completed successfully for the relevant UI and documentation commits, with tests, typecheck and build passing. Later commits remain subject to their own CI results. This is not a full end-to-end or accessibility certification; real browser rendering, customer/staff account workflows and responsive device checks remain to be completed before deployment.

## 2026-11-17 — Jobcard / Workcard workflow integrity repair

Merged PR #36 as commit 66c33e35ee2e173ecc541035f63e5ef254e83544. Follow-up SQL quoting corrections were committed directly to main; main V2 checks passed.

- Fixed Workcard staff assignment input typing and UUID validation. Replacing the team no longer removes workers who have already accepted an assignment.
- Unified Workcard, Jobcard, staff, and master-calendar booking changes through update_jobcard_booking. Database-level advisory locking now serializes confirmations and enforces overlap/travel-buffer conflicts; authorised managers retain the explicit override.
- Jobcard stage transitions are written with Workcard start, worker sign-off, senior review, customer approval, invoice issue, and payment closeout.
- Parts readiness now holds the Workcard until required quantities are received or explicitly marked not required. Admin/staff work-entry changes reconcile Jobcard status and stage; supplier-order reconciliation preserves not-required decisions.
- Customer-requested corrections reopen the Workcard, remove the unissued draft invoice, restore accepted assignments, and require fresh worker sign-off and senior review.
- Final customer approval issues the invoice through issue_invoice. The issuer is the staff member who signed off/approved the work; invoice issuer identity references public.users, not Supabase Auth.
- Removed the duplicate invoice migration filename/version. The canonical V2 migration 20261117230000_workcard_customer_approval_invoice_issue is applied.

Database verification after migration: 84 migration records; 60 public base tables with RLS enabled; 3 compatibility views; all 10 changed/new workflow functions are SECURITY DEFINER and service_role-only. The project remains ACTIVE_HEALTHY.

Verification: V2 checks passed on main (automated tests, TypeScript typecheck, production build). No production deployment was performed. A live end-to-end customer/booking/invoice scenario remains outstanding because the V2 database currently has no invoice, active booking, waiting-parts Jobcard, or outstanding parts records; no synthetic customer data was created.
