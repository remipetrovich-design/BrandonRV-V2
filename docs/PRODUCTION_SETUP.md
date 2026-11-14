# Brandon RV V2 — Environment and pre-deployment setup

This document describes configuration only. V2 is not deployed. Do not deploy or connect a production domain as part of this setup work.

## Runtime environment variables

The complete application runtime variable list is maintained in the repository root `.env.example`.

| Variable | Required | Where it belongs | Purpose |
| --- | --- | --- | --- |
| `SUPABASE_URL` | Yes | Local `.env.local`; Vercel runtime | Dedicated V2 Supabase project URL. |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | Local `.env.local`; Vercel encrypted runtime variable | Server-only Supabase access. Never expose to browser code. |
| `NEXT_PUBLIC_APP_URL` | Recommended when hosted | Local/Vercel runtime | Canonical V2 origin for account verification, reset and invitation links. Leave blank locally to use request origin. |
| `BRANDON_RV_SETUP_SECRET` | One-time | Local/Vercel runtime, temporarily | Protects the first-owner bootstrap at `/setup`. Remove after the owner account is created. |
| `ORBITFS_MAIL_URL` | Only when mail is enabled | Local/Vercel runtime | Existing OrbitFS Mail service base URL. |
| `BRANDONSRV_MAIL_API_KEY` | Only when mail is enabled | Local/Vercel encrypted runtime variable | Existing BrandonRV send-only external-system key. Do not create a replacement key. |
| `BRANDON_RV_LICENSE_ENCRYPTION_SECRET` | Yes before licence activation | Local/Vercel encrypted runtime variable | AES-256-GCM encryption key material for the stored business licence; minimum 32 characters. |
| `BRANDON_RV_VERSION` | No | Local/Vercel runtime | Product version sent to License Manager; defaults to `1.0.0`. |

Do not add `SUPABASE_SERVICE_ROLE_KEY`, mail keys, setup secrets or encryption secrets to `NEXT_PUBLIC_*` variables. Never commit real values to GitHub.

## GitHub Actions

The only current workflow is `.github/workflows/v2-checks.yml`. It runs `npm test`, `npm run typecheck` and `npm run build`. It does not connect to Supabase, run migrations, deploy the application or read environment secrets. **No GitHub Actions secrets are currently required.**

Do not add the old `SUPABASE_ACCESS_TOKEN`, `SUPABASE_DB_PASSWORD` or V1 project reference from previous setup notes. There is no active `supabase-migrations.yml` workflow in this repository. Database migrations are reviewed and applied to the dedicated V2 project through the authorised database workflow.

## V2 infrastructure boundaries

- Repository: `remipetrovich-design/BrandonRV-V2`, branch `main`.
- Supabase: `Brandon-RV-V2`, project ref `lciylmfpcefdpsouoqvm`, region Tokyo (`ap-northeast-1`).
- Vercel: hosting has not been configured or deployed.
- V1 project `thkxalrsklgademwrrlq` is separate and must never be used by V2.

## Local setup

1. Install Node.js 22 and npm.
2. Copy `.env.example` to `.env.local`.
3. Supply the V2 service-role key and a local app origin only if needed.
4. Generate a unique random `BRANDON_RV_LICENSE_ENCRYPTION_SECRET` of at least 32 characters before testing licence activation.
5. Keep `BRANDON_RV_SETUP_SECRET` unset until deliberately testing first-owner creation.
6. Keep OrbitFS Mail variables unset while mail remains paused.
7. Run `npm install`, `npm test`, `npm run typecheck`, `npm run build`.

## First owner setup

The V2 database currently has no user accounts. When the application is deliberately made available for owner setup, configure a strong `BRANDON_RV_SETUP_SECRET`, open `/setup`, and create the real owner account. The endpoint refuses to create a second owner. Remove the setup secret from the hosted environment after successful setup. Do not create placeholder accounts.

## External systems

Brandon RV uses the existing external OrbitFS Mail and License Manager integrations. The mail integration is send-only and uses the existing sender identity assigned by the external system; sender addresses are resolved from that system and must not be duplicated in Brandon RV configuration. Both integrations remain subject to their existing activation and security controls.

## Mail integration

Brandon RV's email renderer uses the existing OrbitFS Mail service through `ORBITFS_MAIL_URL` and `BRANDONSRV_MAIL_API_KEY`. It does not use Resend or an `EMAIL_FROM` variable. Mail remains paused; do not configure or activate delivery until separately authorised. The existing send-only external-system identity and key are to be reused if mail is enabled.

## Licence integration

The existing external License Manager remains the authority. Brandon RV calls its integrated API; it does not maintain a second licensing engine. `BRANDON_RV_LICENSE_ENCRYPTION_SECRET` is required to encrypt the locally stored licence key. `BRANDON_RV_VERSION` is optional and defaults to `1.0.0`. Do not replace the external License Manager URL with an invented environment variable.

## Before any deployment

- Confirm V2 environment values point only to project `lciylmfpcefdpsouoqvm`.
- Configure Vercel runtime variables separately for each environment that will actually be used.
- Keep the owner setup secret temporary.
- Keep mail disabled until explicitly approved.
- Confirm licence activation can reach the existing License Manager.
- Apply only reviewed migrations to V2.
- Run the authorised readiness checks and verify real customer/staff workflows before production use.

No deployment, domain assignment or production activation is authorised by this document.
