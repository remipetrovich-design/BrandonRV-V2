# Standalone Mail Configuration Module

A portable, brand-neutral mail component for installation inside other applications. The module is maintained independently in this folder and can be copied into a host application's source tree without copying the Mail System itself.

## Responsibility boundary

The **host application** owns templates, immutable template revisions, variables, event triggers, recipient resolution, sender routing rules, module enable/disable state, appearance, admin authentication and its database. The **central Mail System** owns mail transports, domains, sender mailboxes, API credentials/scopes, delivery processing and central delivery logs.

The module connects to the central Mail System using the host application's server-only `MAIL_SYSTEM_URL` and `MAIL_SYSTEM_API_KEY`. It verifies the key against `GET /api/mail/senders`, discovers only mailboxes assigned to that External System, and sends through `POST /api/mail`. The central service validates the key and sender permission again on every send.

## Included

- Supabase persistence adapter for templates, revisions, routing, triggers and module settings.
- Host database schema and atomic template-revision SQL functions.
- Server-only Mail System API client and connection verification.
- Explicit setup outcomes: connected, no sender assigned, invalid API key, inactive External System or invalid scope, missing configuration, network failure and Mail System failure.
- Template authoring, variable discovery, preview, revision history and restore.
- Priority-based conditional sender routing and event triggers.
- Recipient resolution delegated to trusted host-side code.
- Embeddable React console with module enable/disable, connection test and appearance controls.
- Automated contract and behavior tests.

## Brandon RV V2 integration manager

This folder is a standalone module discovered by Brandon RV V2's existing Staff Portal → Integrations manager. Keep `integration.json` and `server.cjs` in this folder; the manager uses them to install, configure, test, enable and disable the integration. Set the manager's Endpoint URL to the central Mail System HTTPS origin (without `/api`) and save the dedicated External System API key in the `Mail System API key` secret field. The manager encrypts that key at rest and passes it only to the server entry point. The V2 server also needs its existing Supabase server credentials so event handlers can read this module's `app_mail_*` tables.

The manager activation switch controls whether V2 dispatches events to this module. The module's own `app_mail_settings.enabled` setting remains a separate switch and must also be enabled before configured triggers send mail. This preserves the module's independent application-level enable/disable control.

The V2 adapter currently subscribes to `account.password_reset_requested`, `account.password_changed` and `staff.invitation_created`, the events already wired in the host. Other event names remain available in the core event catalogue but are not subscribed here until the host workflows emit them. For each trigger, `recipient_mapping` must resolve recipients from the trusted event payload using `{"to":"path.to.email"}` or `{"to":["path.to.email","path.to.otherEmail"]}`. Literal addresses are not accepted as recipient mappings.

## Quick start

1. Copy this folder into the host application's source tree.
2. Apply `schema.sql`, then `supabase-functions.sql` to the host application's database.
3. Configure server-only `MAIL_SYSTEM_URL` and `MAIL_SYSTEM_API_KEY`.
4. Register the host as an External System in Mail System. Issue an active key with the exact `mail:send` scope and assign at least one active sender mailbox.
5. Create the host's authenticated Supabase client, call `createSupabaseMailModuleStore(client)`, and mount `MailModuleConsole` behind the host's own admin authorization.
6. Pass a server-side `onTestConnection` callback that calls `verifyMailSystemConnection()`. Do not pass the key to a Client Component.
7. Test the connection, choose an assigned sender, configure templates/routes/triggers, then enable the module.

See [INSTALL.md](./INSTALL.md), [API.md](./API.md) and [schema.sql](./schema.sql). The module does not create public admin routes or bypass host authorization.
