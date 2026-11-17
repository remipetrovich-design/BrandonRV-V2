# Owner setup and access

This guide describes the existing V2 owner and account-access flow. It does not require business details, service lists, prices, staff records or a business-plan worksheet to be entered before the application can be developed.

## First owner

1. Open the V2 application at `/setup`.
2. Enter the owner's full name, email address and a password (12–128 characters), then confirm the password.
3. The application sends the request to `POST /api/auth/bootstrap-owner`.
4. The server validates the request origin and input, hashes the password with Argon2id, and calls the database's `bootstrap_first_owner` RPC.
5. The database operation is the one-time gate: if owner setup has already been completed, another first owner cannot be created.
6. On success, the server creates the owner's authenticated session and redirects to the admin application.

The owner bootstrap endpoint requires the V2 Supabase URL and server-side key to be configured. The application accepts `SUPABASE_SECRET_KEY` or the legacy `SUPABASE_SERVICE_ROLE_KEY`; the URL is resolved from the V2 Supabase configuration. These values belong in the hosting environment, never in source code, Trello or chat. Do not use V1 credentials or project references.

If the bootstrap operation reports that business setup is incomplete, resolve the V2 database's required initial business record through the authorised setup process. Do not bypass the one-time database gate or create a second owner manually.

## One identity per person

- `public.users` is the canonical login identity.
- Every ordinary registration starts as a customer account with `primary_group = customer` and no employee role.
- Staff access is an extension of that same account; hiring an existing customer does not create another login or replace customer records.
- The admin area requires an authenticated active user, an active employee/global-administrator role and the relevant permission.
- Customer-facing and staff-facing screens are separate views of the same underlying identity and records.

## Roles and permissions

The canonical unrestricted administrator roles are `ceo_founder` and `website_development_specialist`. Legacy aliases `owner` and `website_developer` remain recognised for existing accounts. Other staff roles receive their effective permissions from `user_role_permissions`, with any active individual grants in `user_permission_grants`.

Permission checks are enforced in server-side route handlers and layouts through the shared auth helpers. Navigation visibility is not the security boundary. Database row-level security remains enabled as the database boundary; do not weaken RLS to make a page load.

The sign-in response now uses the same canonical global-administrator role policy as the server authorization layer. This prevents canonical CEO / Founder and Website Development Specialist accounts from being reported as lacking business access merely because they do not use the legacy role aliases.

## Staff onboarding

An authorised administrator invites staff from Admin → Employees. Invitations are tied to an email and selected role, expire after seven days, and are single-use. A person who already has a customer account signs in with it and accepts the invitation; a new person registers as a customer first, then accepts the invitation using the same email address. Revoked, expired, already accepted or email-mismatched invitations are rejected.

If email delivery is paused, the application can provide an invitation link for the administrator to share through an approved channel. Do not activate outbound email as part of this setup guide.

## Sign-in, sessions and recovery

- Passwords are stored as Argon2id hashes; plaintext passwords are not stored.
- Sign-in uses a server-managed, HTTP-only session cookie with a 14-day expiry.
- The login endpoint limits repeated failed attempts for an email/IP combination.
- Sign-out deletes the server session and clears the cookie.
- Password reset links expire after one hour and a successful reset invalidates existing sessions.
- Password recovery requires the existing email delivery integration to be configured. If mail is paused or unavailable, the recovery endpoint reports that recovery email is not configured; do not claim recovery is live.

## Environment and operational boundaries

Configure the V2 Supabase URL and server key only in the V2 Vercel environment and local development environment as appropriate. Keep email integration credentials separate and leave delivery paused until explicitly authorised. Never place credentials in GitHub files, PR descriptions, Trello cards or chat.

This guide documents the application flow; it does not prove that a particular production account, invitation, email delivery or password reset has been exercised. No production credentials are required in this document, and no database migration is introduced by it.
