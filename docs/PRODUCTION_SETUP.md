# Brandon RV V2 — deployment environment setup

This document lists deployment configuration for the existing V2 production deployment. V2 is deployed to the dedicated Vercel project `brandon-rv-v2`, linked to `remipetrovich-design/BrandonRV-V2`. The latest Production deployment was READY on 17 November 2026. This document does not authorise unrelated production deployments or domain changes.

## Vercel environment variables

The root `.env.example` contains only standard dotenv `KEY=VALUE` entries for Vercel runtime variables and can be imported directly in Vercel Project Settings → Environment Variables. Blank values are placeholders to fill in after import. GitHub Actions secrets and variables are documented separately below and are deliberately excluded from `.env.example`.

| Variable | Requirement | Purpose |
| --- | --- | --- |
| `SUPABASE_URL` | Required | Dedicated V2 Supabase project URL: `https://lciylmfpcefdpsouoqvm.supabase.co`. |
| `SUPABASE_SERVICE_ROLE_KEY` | Required | Server-only Supabase access. Keep encrypted and never expose to browser code. |
| `NEXT_PUBLIC_APP_URL` | Recommended | Canonical hosted V2 origin for account verification, reset and invitation links. |
| `BRANDON_RV_SETUP_SECRET` | Temporary | Required only for first-owner creation through `/setup`; remove immediately after successful setup. |
| `ORBITFS_MAIL_URL` | Paused / do not configure now | Existing OrbitFS Mail service URL. |
| `BRANDONSRV_MAIL_API_KEY` | Paused / do not configure now | Existing BrandonRV send-only external-system key. Do not create a replacement key. |

Use the same V2 Supabase project in every Vercel environment intended for use. Do not configure V1 credentials. Keep all server secrets unprefixed by `NEXT_PUBLIC_`. Never commit real values to GitHub.

## GitHub Actions

The standard `.github/workflows/v2-checks.yml` workflow runs tests, typecheck and build. Vercel Git-based automatic deployments are intended to remain **enabled** for normal application changes. These ordinary Vercel deployments do not apply Supabase migrations; database migrations are applied only through the separate manual migration workflow described below.

A separate `.github/workflows/manual-deploy-migrate.yml` workflow has been added for an Owner or Website Developer to request a manual production deployment from the admin panel. It is deliberately dormant:
- It runs only through `workflow_dispatch`; ordinary Git pushes and Vercel automatic deployments remain enabled and do not apply migrations.
- Both the Vercel application flag and GitHub repository variable `BRANDON_RV_MANUAL_DEPLOY_ENABLED` must be explicitly set to `true`.
- The admin action is visible only to Owner and Website Developer accounts and requires a server-side GitHub dispatch token.
- The workflow builds the application first, links only Supabase project `lciylmfpcefdpsouoqvm`, previews pending migrations, applies them with `supabase db push --linked`, then deploys the verified build to Vercel Production.
- Supabase migration history skips migrations already applied. The workflow never runs `db reset`, never targets V1 and never applies seed data.
- The workflow checks all required credentials and Vercel project identifiers before it changes the database. It requires the GitHub `production` environment.

### Required configuration for the manual deploy workflow (keep disabled until ready)

**Vercel Project Settings → Environment Variables (Production; add Preview only if deliberately used). These are also listed in the importable root `.env.example`:**
- `BRANDON_RV_MANUAL_DEPLOY_ENABLED=false` — leave false until explicitly activated.
- `GITHUB_ACTIONS_DISPATCH_TOKEN` — fine-grained GitHub token with Actions: write for this repository. Never expose it to the browser.

**GitHub repository → Settings → Secrets and variables → Actions → Variables:**
- `BRANDON_RV_MANUAL_DEPLOY_ENABLED=false` — independent workflow activation gate.

**GitHub repository → Settings → Secrets and variables → Actions → Secrets:**
- `SUPABASE_ACCESS_TOKEN` — Supabase personal access token for the CLI.
- `SUPABASE_DB_PASSWORD` — database password for the dedicated V2 project.
- `VERCEL_TOKEN` — Vercel deployment token.
- `VERCEL_ORG_ID` — Vercel team or account ID.
- `VERCEL_PROJECT_ID` — Vercel project ID linked to the `BrandonRV-V2` repository.

Configure the GitHub `production` environment and its approval protection before activation. The Supabase project reference is fixed in the workflow as `lciylmfpcefdpsouoqvm`; do not replace it with the V1 reference. Keep all credentials out of source control.

No migration or deployment is triggered by adding these files. Keep both manual-workflow activation gates false until the Vercel project and credentials have been confirmed. Do not disable Vercel Git-based automatic deployments; they remain the normal application deployment path and do not run database migrations.

## V2 infrastructure boundaries

- Repository: `remipetrovich-design/BrandonRV-V2`, branch `main`.
- Supabase: `Brandon-RV-V2`, project ref `lciylmfpcefdpsouoqvm`, region Tokyo (`ap-northeast-1`).
- Vercel: the V2 project is `brandon-rv-v2` (`prj_ZI2MbFrpCJFovX9unahbN5WgLqTw`) in team `techteam36`, linked to `remipetrovich-design/BrandonRV-V2`. Its Production domains are `brandon-rv-v2.vercel.app`, `brandon-rv-v2-techteam36.vercel.app` and `brandon-rv-v2-git-main-techteam36.vercel.app`. The separate `brandon-rv` project is linked to the V1 repository and must not be used for V2.
- V1 project `thkxalrsklgademwrrlq` is separate and must never be used by V2.

## First owner setup

The V2 database currently has no user accounts. When the application is deliberately made available for owner setup, configure a strong `BRANDON_RV_SETUP_SECRET`, open `/setup`, and create the real owner account. The endpoint refuses to create a second owner. Remove the setup secret from Vercel after successful setup. Do not create placeholder accounts.

## External systems

Brandon RV uses the existing external OrbitFS Mail integration. The mail integration is send-only and uses the existing sender identity assigned by the external system; sender addresses are resolved from that system and must not be duplicated in Brandon RV configuration. Mail remains paused and must not be configured or activated until separately authorised.

## Before any deployment

- Confirm Vercel account/team and project ownership. Link or create the Vercel project for `remipetrovich-design/BrandonRV-V2`; do not accidentally deploy through the existing `brandon-rv` project while it remains linked to `remipetrovich-design/Brandon-RV-`.
- Confirm all configured Supabase values point only to project `lciylmfpcefdpsouoqvm`.
- Configure Vercel variables for only the environments that will actually be used.
- Keep the owner setup secret temporary.
- Keep mail disabled.
- Apply only reviewed migrations to V2.
- Run the authorised readiness checks and verify real customer/staff workflows before production use.

No deployment, domain assignment or production activation is authorised by this document.
