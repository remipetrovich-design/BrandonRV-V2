# Brandon RV V2

This is the independent V2 development repository. The original `Brandon-RV-` repository and its production deployment are not modified by V2 work. V2 uses its own dedicated Supabase project `lciylmfpcefdpsouoqvm` in Tokyo (`ap-northeast-1`), with separate database, authentication, storage, migration history and keys. V2 is not connected to a production Vercel deployment. Never point V2 at the original V1 Supabase project.

Brandon RV is a mobile caravan and motorhome interior repair and accessories business based in Tamworth, NSW. This repository contains the public website, customer portal and shared staff/admin application.

## Application

- Public business website and service information
- Customer registration, sign-in and account portal
- Customer vehicle records and appointment requests
- Quotes, invoices and customer job information
- Staff workspace, work orders and job assignment
- Business administration, service catalogue and service-area settings
- Role- and permission-based access for staff and administrators

The application is built with Next.js 16, React 19, TypeScript and Supabase.


## Application licensing

Brandon RV is registered with the central License Manager as product ID `brandon-rv`. One licence represents the Brandon RV business installation; it is not assigned per employee or customer account. The existing `users`, customer, employee, session, vehicle, job, quote, invoice and business records remain independent of licence state.

The application-level guard is implemented in `src/proxy.ts` and protects website pages and API routes. When the licence is missing, invalid, expired, suspended, revoked, or the unified licensing API is unavailable, protected requests are blocked. The `/license` page and sign-in/account recovery routes remain reachable so an owner can restore access. API requests receive HTTP 423 while the licence is not valid.

The owner or Website Developer installs a key at `/license`. The server validates the key against `https://incendiarynetworks.cc/api/v1/license/validate` and checks service health at `https://incendiarynetworks.cc/api/v1/license/health`, then stores it encrypted with AES-256-GCM in `application_license`. The key is never returned to the browser. Configure the server-only environment variable `BRANDON_RV_LICENSE_ENCRYPTION_SECRET` with a random secret of at least 32 characters. Never prefix it with `NEXT_PUBLIC_`. The migration `20261112090000_application_license.sql` is included in this repository, but V2 does not apply database migrations automatically.

Brandon RV's live licensing implementation is integrated into the normal application source: `src/lib/license-manager-client.js` contains the portable License Manager client and enforcement helpers, `src/lib/brandon-license.ts` provides Brandon RV's encrypted storage and activation adapter, `/license` provides owner activation, `/admin/license` provides monitoring, and `src/proxy.ts` enforces the licence across protected pages and API routes. The original portable source has been archived as `standalone-license-module.zip` and removed from the runtime repository; the application does not import or depend on a separate module folder. For another product, use the retained ZIP archive and its Next.js integration guide; register its own product ID and configure a separate stable business-installation ID and encryption secret. Do not copy Brandon RV's product ID, database table, auth implementation or secrets into another product.

## Account and database model

The \`public.users\` table is the single account identity table. Every person has one customer account, one login and \`primary_group = customer\`. The nullable \`user_role\` field defaults to \`NULL\`, which means customer-only access. Owner, Website Developer and other employee roles are assigned directly to the user account through the global user-role catalogue.

Employment is an optional addon on the same user row. It stores employment type/status, job title, employee number, start/end dates, pay rate and frequency, payroll details, emergency contacts and employee notes. Hiring an existing customer activates these fields; it never creates another account. Terminating employment removes ordinary employee access but preserves the customer login and all customer data.

Vehicles, enquiries, quotes, appointments, jobs, invoices, payments and documents remain separate operational records linked to the same user/customer ID. The customer and employee screens are different views of that one identity.

Global role permissions are stored in \`user_roles\` and \`user_role_permissions\`. Owner and Website Developer have unrestricted application access. Legacy business-membership and permission-group tables are retained for migration compatibility, but runtime authentication and permission checks no longer depend on business roles or business memberships. Role-level and member-specific permissions are migrated into global roles; distinct effective permission sets receive separate shared synthetic roles so one employee's extra permissions are not granted to everyone with the same base role.

## Supabase migrations

Database migrations are stored in `supabase/migrations/` and belong exclusively to the dedicated V2 Supabase project `lciylmfpcefdpsouoqvm`. The application runtime does not apply migrations automatically. Review each migration and apply it only to the V2 project through the authorised database workflow. Never apply V2 migrations to V1.

### GitHub Actions secrets

Add these as repository Actions secrets:

| Secret | Purpose |
| --- | --- |
| `SUPABASE_ACCESS_TOKEN` | Supabase personal access token used by the Supabase CLI |
| `SUPABASE_DB_PASSWORD` | Database password for the target Supabase project |
| `SUPABASE_PROJECT_ID` | Supabase project reference |

The configured V2 project reference is `lciylmfpcefdpsouoqvm`.

**Migration status:** The dedicated V2 project has its own migration history; the latest inspected snapshot records 66 applied migration records. No V1 operational data was copied. See `docs/V2-DATABASE-ARCHITECTURE.md` for the inspected database snapshot.

Do not commit access tokens, database passwords, service-role keys or other credentials to this repository.

## Local development

Requirements: Node.js and npm.

```bash
npm install
cp .env.example .env.local
npm run dev
```

Set the required values in `.env.local` before using application features that connect to Supabase or send email.

Available scripts:

- `npm run dev` — start the local development server
- `npm test` — run the user-role access policy tests
- `npm run typecheck` — run the TypeScript check
- `npm run build` — create a production build
- `npm run start` — start the production server

## Environment variables

The root `.env.example` is the complete list of application runtime variables. See [Environment and pre-deployment setup](./docs/PRODUCTION_SETUP.md) for the exact purpose of each variable and whether it belongs in GitHub Actions or Vercel. The standard V2 checks workflow requires no secrets. The separate manual deploy workflow is dormant and requires dedicated GitHub Actions secrets and activation gates; see [Environment and pre-deployment setup](./docs/PRODUCTION_SETUP.md). Runtime variables belong in local `.env.local` and, when hosting is configured, in Vercel. Never commit actual secret values.

## Transactional email and staff invitations

V2 uses `NEXT_PUBLIC_APP_URL` for account verification, password reset and staff invitation links when configured. If it is blank, links use the current request origin. Set it to the V2 production URL when V2 is connected to Vercel; do not set it to the original Brandon RV production URL.

Transactional mail is sent through the existing OrbitFS Mail integration. Configure `ORBITFS_MAIL_URL` and `BRANDONSRV_MAIL_API_KEY` in the Vercel environment. The email-template admin page is available under Admin → Business configuration → Email templates and requires `business.settings.manage`.

Administrators can create, edit and delete custom templates, attach templates to registered application events/functions, enable or disable eligible templates, and select a sender mailbox from the live sender assignments returned by OrbitFS Mail. Sender mailbox IDs are checked against the current Mail System directory before sending. Required account-security templates cannot be disabled, moved to another event or deleted.

The shared email renderer applies Brandon RV branding to automated and manually-triggered template emails: branded header with the business logo and tagline, message content, and footer with logo, website, phone and email contact details, privacy/sensitive-information handling notice and copyright. Messages sent from a `noreply` mailbox display an additional notice at the top stating that the mailbox is unmonitored and replies or messages sent to it will not be read. The current shared logo asset is `public/brv-mark.webp`.

### Staff invitation flow

Staff invitations are created by authorised staff administrators from People/Staff management. Each invitation is single-use, expires after seven days and is tied to the invited email address and selected staff role. The invitation email uses the managed `staff_invitation` template and links to:

`[V2_APP_ORIGIN]/portal/accept-staff-invitation?token=...`

If the invitee already has an active customer account, they sign in with that account and accept the invitation; staff access is added to the existing identity without replacing customer records or history. If they do not have an account, they register as a customer using the invited email address. Email verification, when enabled, carries the invitation token forward; after verification they return to the invitation acceptance page. The invitation is validated again at acceptance, including email match, expiry, revocation and single-use status. The new account remains a customer account with staff access added as an employment/role extension.

## Business configuration

The Business Configuration area is the control centre for the public business website and its customer-facing details.

- **Website editor:** edit the seeded example pages, preview draft content and save changes. Publishing is a separate action, so saved drafts do not automatically change the live website.
- **Services:** create, edit, organise, price, activate, publish and delete the services Brandon RV chooses to offer. The live catalogue starts empty; Chris manages the actual service list.
- **Service areas:** manage area names, descriptions, radius, suburbs, postcodes, travel fees and publication status.
- **Settings:** manage the public business profile and general operating preferences from one consolidated page.
- **Email templates:** remains a separate tool for managing automated and customer email content.
- **Integrations:** shows the status of existing connected services, including the OrbitFS Mail System, without exposing credentials.

Service and area changes are stored against the Brandon RV business and flow to the public service pages and customer-facing service selection where applicable. Draft or unpublished entries remain hidden from the public website. Existing customer, job, quote, appointment, invoice and account records are retained.

The business owner decides which services Brandon RV offers and manages the catalogue directly. The application does not create a résumé or infer a service list from the business plan.

## Deployment

The application is configured for deployment through the connected hosting environment. Configure the production environment variables there separately from GitHub Actions migration secrets. A successful database migration run confirms the migrations were applied; it does not, by itself, confirm a production website deployment.


## Customer intake, tickets, quotes and bookings

The public Contact page records **General Enquiries** separately from quote requests. General enquiries are not automatically converted into tickets, quotes or bookings.

The public Request a Quote form is available without registration. Guest requests receive a Request Quote ID and a secure access link/code. Signed-in customers can reuse their account details and select a saved vehicle; a newly entered vehicle is added to their vehicle list. Customer Enquiries are created from the customer portal and use the same ticket conversation system.

Customer Enquiries and Quote Requests are ticket-backed records. Customers and staff can exchange messages against the ticket; staff can add internal-only notes. Guest quote requests use a time-limited access token and do not require a customer login. Quotes are attached to tickets where applicable, support revision history, and record customer acceptance or decline with a timestamp.

A preferred appointment time is only a request. Once the customer accepts a quote, staff create exactly one Workcard from that accepted quote. The Workcard goes through senior setup review before management assigns a worker; the worker must accept the assignment before arranging a booking. Management confirms the agreed date, start/end time and service location, then links that confirmed Booking to the existing Workcard. Booking confirmation never creates a second job record. The customer and staff/admin interfaces remain views over the same user identity and Supabase database.

The migration is part of V2 source history. Check the dedicated V2 project's migration history before applying subsequent database changes.


## Owner configuration and launch readiness (Phase 6)

The owner-facing Business Configuration area supports public business details, draft website content with preview and separate publishing, service areas, email templates and sender assignments, integrations, role permissions, booking availability, cancellation settings and pricing/GST configuration. Booking days, hours and unavailable dates are enforced when configured. Rates and GST remain unconfigured until Chris confirms them with the accountant; the business-plan figures are not treated as approved prices.

Services have an explicit approval status: Approved for launch, Conditional, Assessment required, Deferred or Not offered. Only active, published services approved for launch are exposed to customers. Newly created services default to Assessment required and cannot be published until explicitly approved.

The Phase 6 migration adds this service approval gate. It is forward-only. V2 does not apply it automatically; verify whether it is already present in the dedicated V2 database before considering any migration action.

## Launch readiness (Phase 7)

The production build must complete successfully before the application is considered deployable. Customer account isolation, staff permissions, quote approval, confirmed booking creation, Work Order generation, invoices, payment provider confirmation, email delivery, private file access and backup recovery still require operational verification before real customer use. Some checks require Chris to use the customer and staff interfaces; those are not represented as completed by a successful build.


## Unified enquiry and request management

The admin panel has one Enquiries & Requests register. Public Contact form submissions, general enquiries logged by staff, customer portal enquiries and quote requests are stored once in the existing `enquiries` table and shown as category filters in the same register. The old category URLs redirect to the matching filter; they do not create separate records or separate inbox implementations.

Staff with the required permission can create an intake record directly in the admin panel, edit the contact and request details, change its pipeline stage, assign multiple active employees, review assignment and stage history, view private attachments and continue the internal/customer conversation. Public Contact form submissions use the `public_enquiry` type. Existing Contact form records are reclassified in place during the migration, not duplicated. General enquiries remain available for staff-entered phone, email and in-person requests.

Pipeline stages: New, Contacted, Awaiting Information, Assessment Required, Quote in Progress, Quote Sent, Awaiting Approval, Approved, Declined, Converted and Closed. Existing enquiry status values are retained for compatibility with the quote and booking workflows; stage changes update the corresponding legacy status and create an immutable stage-history entry.

Staff assignment history and stage history are stored against the same enquiry record. Assignments are business-scoped and limited to active staff in the Brandon RV workspace. The unified enquiry migration is forward-only. V2 does not apply it automatically; verify the dedicated V2 database migration history before considering any migration action.
