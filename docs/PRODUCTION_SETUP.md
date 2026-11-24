# Brandon RV V2 — deployment and launch readiness

Last checked: 17 November 2026. This document records the V2 environment only. It does not authorise a production deployment, public-access change, domain change, or migration.

## Current V2 state

- Repository: `remipetrovich-design/BrandonRV-V2`, production branch `main`.
- Vercel project: `brandon-rv-v2`; latest Production deployment status is `READY`.
- Vercel deployment SSO protection is enabled for all non-custom domains. The project currently has Vercel-hosted domains and no verified custom customer domain. Customers therefore cannot access the public site through those protected Vercel domains until public access is deliberately enabled.
- Supabase project: `Brandon-RV-V2`, ref `lciylmfpcefdpsouoqvm`, Tokyo region. The Vercel project has the Supabase integration attached.
- Live database snapshot: 58 public base tables, 3 compatibility views, RLS enabled on all 58 tables, 76 remote migration records.
- One active CEO/founder account exists. The business remains `prelaunch`.
- No genuine customer enquiries, quotes, bookings, Workcards, invoices or payments have been inserted. No fake customer records have been created.
- The business setting `accepting_enquiries` is explicitly `true`; the public general-enquiry and assessment-request handlers are ready to record genuine requests once customer access is opened.
- The internal service catalogue contains 9 draft scope records: 2 assessment-required launch candidates, 2 conditional services, 3 deferred services and 2 not-offered categories. All are inactive and unpublished.
- One provisional Tamworth 20 km service area exists; it is unpublished and has no travel fee.
- Eight website-builder pages exist; none are published.
- Business pricing/GST and operating hours are not configured.

The service catalogue and provisional service area are internal setup records only. They are not customer-facing offers. No service is approved for launch or selectable for a quote until the business owner completes the required scope, licensing, insurance, competence and operational review.

## Vercel and Supabase integration

The Vercel project is connected to the dedicated V2 Supabase integration. The integration supplies the application URL/key variables and the PostgreSQL connection variables, including `NEXT_PUBLIC_SUPABASE_URL` and `POSTGRES_URL_NON_POOLING`.

- Keep the Supabase integration attached to the V2 Vercel project.
- The application now prefers the integration-provided `NEXT_PUBLIC_SUPABASE_URL` over the legacy `SUPABASE_URL` variable and validates that it resolves to `lciylmfpcefdpsouoqvm`.
- The server-side database client uses `SUPABASE_SECRET_KEY` first, retaining legacy service-role compatibility only as a fallback.
- Do not paste database URLs, passwords, or secret API keys into chat or commit them to source control.
- `NEXT_PUBLIC_APP_URL` should remain the V2 application origin, not the V1 domain.
- `BRANDONRV_PUBLIC_EMAIL` must remain blank until the supplied address, domain and mailbox are verified.

## Manual production deployment and migrations

The three independent manual workflows are `.github/workflows/manual-full-scan.yml`, `.github/workflows/manual-scan-apply-migrations.yml` and `.github/workflows/manual-deploy-latest.yml`.

- It has only a `workflow_dispatch` trigger. It has no `push` trigger and ordinary Vercel Git deployments do not apply Supabase migrations.
- Deployment is manually dispatched from the admin control or the dedicated GitHub Actions workflow; the caller must type `YES`. The legacy `BRANDON_RV_MANUAL_DEPLOY_ENABLED` flag is not a deployment prerequisite.
- The legacy `BRANDON_RV_MANUAL_DEPLOY_ENABLED` variable is not read by the current deployment or migration workflows and has no effect. It can remain false or unset. Deployment is gated by a successful Full Scan for the exact commit and the required Production GitHub environment.
- The admin-panel dispatch route is restricted to Owner or Website Developer. `GITHUB_ACTIONS_DISPATCH_TOKEN` enables direct in-app dispatch; when it is absent, the control opens the matching GitHub Actions workflow so the operator can start it there.
- GitHub Actions requires only `VERCEL_TOKEN`, `VERCEL_ORG_ID` and `VERCEL_PROJECT_ID` secrets for deployment. The Vercel Supabase integration supplies `POSTGRES_URL_NON_POOLING`; separate `SUPABASE_ACCESS_TOKEN` and `SUPABASE_DB_PASSWORD` secrets are not required.
- The workflow validates the Vercel project and Supabase project reference, previews the remote migration plan, builds the application before changing the database, applies migrations through the Vercel-integrated direct connection, and then deploys the verified build.
- The GitHub `production` environment remains required.

The V2 repository migration filenames have been aligned with the 76 migration versions already recorded in the remote V2 database. No migration has been run by this work. All three workflows remain manual-only and are not triggered automatically by this documentation change.

## Before accepting customer enquiries publicly

1. Deliberately decide whether to remove Vercel SSO protection or configure and verify a custom domain. No public-access setting has been changed.
2. Complete owner review of the internal draft service catalogue. No service is currently approved, active or published.
3. Confirm legal scope, licences, insurance, competence, safe work conditions and any supplier/parts arrangements before approving a service.
4. Configure opening hours and booking rules before accepting customer bookings.
5. Confirm pricing, GST registration/status and payment terms before issuing operational quotes or invoices.
6. Complete account-notification delivery through the future installed module before enabling notification-dependent workflows.
7. Publish website-builder pages only after the business content and contact details are confirmed.

The general enquiry form and assessment-required quote-request path are implemented. Once public access is deliberately enabled, customers can submit genuine enquiries without the application fabricating sample customers or jobs. With no approved service records, quote requests must remain assessment/inspection requests rather than promises to perform unapproved work.
