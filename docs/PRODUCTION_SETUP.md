# Brandon RV V2 — deployment environment setup

This document lists deployment configuration only. V2 is not deployed. Do not deploy, activate a Vercel project or connect a production domain as part of this setup work.

## Vercel environment variables

The root `.env.example` is the deployment variable inventory. Configure values in Vercel Project Settings → Environment Variables when the Vercel project/account has been confirmed.

| Variable | Requirement | Purpose |
| --- | --- | --- |
| `SUPABASE_URL` | Required | Dedicated V2 Supabase project URL: `https://lciylmfpcefdpsouoqvm.supabase.co`. |
| `SUPABASE_SERVICE_ROLE_KEY` | Required | Server-only Supabase access. Keep encrypted and never expose to browser code. |
| `NEXT_PUBLIC_APP_URL` | Recommended | Canonical hosted V2 origin for account verification, reset and invitation links. |
| `BRANDON_RV_SETUP_SECRET` | Temporary | Required only for first-owner creation through `/setup`; remove immediately after successful setup. |
| `BRANDON_RV_LICENSE_ENCRYPTION_SECRET` | Required before licence storage/activation | Encryption key material for the locally stored licence key. Generate a unique cryptographically-random value of at least 32 characters. |
| `BRANDON_RV_VERSION` | Optional | Product version sent to the existing License Manager; defaults to `1.0.0`. |
| `ORBITFS_MAIL_URL` | Paused / do not configure now | Existing OrbitFS Mail service URL. |
| `BRANDONSRV_MAIL_API_KEY` | Paused / do not configure now | Existing BrandonRV send-only external-system key. Do not create a replacement key. |

Use the same V2 Supabase project in every Vercel environment intended for use. Do not configure V1 credentials. Keep all server secrets unprefixed by `NEXT_PUBLIC_`. Never commit real values to GitHub.

## GitHub Actions

The current `.github/workflows/v2-checks.yml` runs `npm test`, `npm run typecheck` and `npm run build`. It does not connect to Supabase, run migrations, deploy the application or read environment secrets.

**GitHub Actions currently requires no repository secrets and no repository variables.** Do not add secrets unless a future workflow explicitly references them.

Do not add the old `SUPABASE_ACCESS_TOKEN`, `SUPABASE_DB_PASSWORD` or V1 project reference from previous setup notes. There is no active `supabase-migrations.yml` workflow in this repository.

## V2 infrastructure boundaries

- Repository: `remipetrovich-design/BrandonRV-V2`, branch `main`.
- Supabase: `Brandon-RV-V2`, project ref `lciylmfpcefdpsouoqvm`, region Tokyo (`ap-northeast-1`).
- Vercel: hosting has not been configured or deployed.
- V1 project `thkxalrsklgademwrrlq` is separate and must never be used by V2.

## First owner setup

The V2 database currently has no user accounts. When the application is deliberately made available for owner setup, configure a strong `BRANDON_RV_SETUP_SECRET`, open `/setup`, and create the real owner account. The endpoint refuses to create a second owner. Remove the setup secret from Vercel after successful setup. Do not create placeholder accounts.

## External systems

Brandon RV uses the existing external OrbitFS Mail and License Manager integrations. The License Manager remains the licensing authority; do not introduce a duplicate licensing engine or invent a replacement License Manager URL. Mail remains paused and must not be configured or activated until separately authorised.

## Before any deployment

- Confirm Vercel account/team and project ownership before creating or activating a Vercel project.
- Confirm all configured Supabase values point only to project `lciylmfpcefdpsouoqvm`.
- Configure Vercel variables for only the environments that will actually be used.
- Keep the owner setup secret temporary.
- Keep mail disabled.
- Confirm the existing License Manager integration is reachable before licence activation.
- Apply only reviewed migrations to V2.
- Run the authorised readiness checks and verify real customer/staff workflows before production use.

No deployment, domain assignment or production activation is authorised by this document.
