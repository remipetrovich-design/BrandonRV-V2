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
- The internal service catalogue contains 9 draft scope records: 2 assessment-required launch candidates, 2 conditional services, 3 deferred services and 2 not-offered categories. All are inactive and unpublished.
- One provisional Tamworth 20 km service area exists; it is unpublished and has no travel fee.
- Eight website-builder pages exist; none are published.
- The database email-template table currently has no configured rows. Bundled template rendering exists, but outbound mail delivery remains paused.
- Business pricing/GST and operating hours are not configured. The supplied public email address still requires spelling, domain and mailbox verification.

The service catalogue and provisional service area are internal setup records only. They are not customer-facing offers. No service is approved for launch or selectable for a quote until the business owner completes the required scope, licensing, insurance, competence and operational review.

## Vercel and Supabase integration

The Vercel project is connected to the dedicated V2 Supabase integration. The integration supplies the application URL/key variables and the PostgreSQL connection variables, including `NEXT_PUBLIC_SUPABASE_URL` and `POSTGRES_URL_NON_POOLING`.

- Keep the Supabase integration attached to the V2 Vercel project.
- The application now prefers the integration-provided `NEXT_PUBLIC_SUPABASE_URL` over the legacy `SUPABASE_URL` variable and validates that it resolves to `lciylmfpcefdpsouoqvm`.
- The server-side database client uses `SUPABASE_SECRET_KEY` first, retaining legacy service-role compatibility only as a fallback.
- Do not paste database URLs, passwords, or secret API keys into chat or commit them to source control.
- `NEXT_PUBLIC_APP_URL` should remain the V2 application origin, not the V1 domain.
- `BRANDONRV_PUBLIC_EMAIL` must remain blank until the supplied address, domain and mailbox are verified.

## Email delivery

`ORBITFS_MAIL_URL` and `BRANDONSRV_MAIL_API_KEY` are present as application configuration points but are currently empty. Outbound customer and staff email is therefore not ready. Do not enable email-dependent customer workflows until the existing Mail integration is configured and tested. Do not invent or substitute a new mail provider key.

## Manual production deployment and migrations

The manual workflow is `.github/workflows/manual-deploy-migrate.yml`.

- It has only a `workflow_dispatch` trigger. It has no `push` trigger and ordinary Vercel Git deployments do not apply Supabase migrations.
- The GitHub repository variable `BRANDON_RV_MANUAL_DEPLOY_ENABLED` must be `true`, and the caller must type `YES`.
- The Vercel Production variable `BRANDON_RV_MANUAL_DEPLOY_ENABLED` is currently `false`. The migration helper also checks this Vercel-side gate, so a direct GitHub dispatch cannot apply migrations or deploy while it remains false.
- The admin-panel dispatch route is restricted to Owner or Website Developer and requires the server-side `GITHUB_ACTIONS_DISPATCH_TOKEN`.
- GitHub Actions requires only `VERCEL_TOKEN`, `VERCEL_ORG_ID` and `VERCEL_PROJECT_ID` secrets for deployment. The Vercel Supabase integration supplies `POSTGRES_URL_NON_POOLING`; separate `SUPABASE_ACCESS_TOKEN` and `SUPABASE_DB_PASSWORD` secrets are not required.
- The workflow validates the Vercel project and Supabase project reference, previews the remote migration plan, builds the application before changing the database, applies migrations through the Vercel-integrated direct connection, and then deploys the verified build.
- The GitHub `production` environment remains required.

The V2 repository migration filenames have been aligned in this change branch with the 76 migration versions already recorded in the remote V2 database. No migration has been run by this work. The manual workflow remains inactive.

## Before accepting customer enquiries publicly

1. Deliberately decide whether to remove Vercel SSO protection or configure and verify a custom domain. No public-access setting has been changed.
2. Complete owner review of the internal draft service catalogue. No service is currently approved, active or published.
3. Confirm legal scope, licences, insurance, competence, safe work conditions and any supplier/parts arrangements before approving a service.
4. Configure opening hours and booking rules before accepting customer bookings.
5. Confirm pricing, GST registration/status and payment terms before issuing operational quotes or invoices.
6. Verify the supplied public email address and configure the existing Mail integration before enabling outbound email.
7. Publish website-builder pages only after the business content and contact details are confirmed.

The general enquiry form and assessment-required quote-request path are implemented. Once public access is deliberately enabled, customers can submit genuine enquiries without the application fabricating sample customers or jobs. With no approved service records, quote requests must remain assessment/inspection requests rather than promises to perform unapproved work.
