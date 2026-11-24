# Integrations

This directory is the discovery root for optional, separately installed modules. The core application scans its immediate child folders for a valid `integration.json` manifest and a `server.cjs` entry point. Valid modules appear in Staff Portal → Integrations.

**Mail System is installed here as a standalone provider module.** Other provider modules, demos, placeholders and provider credentials must not be added unless explicitly approved.

## Installed module layout

```text
integrations/
├── README.md
├── manifest.schema.json
└── <Integration-Name>/
    ├── integration.json
    └── server.cjs
```

Each installed module owns its implementation, provider adapter, configuration, types, documentation and tests in its own folder. Its manifest declares its stable id, name, version, description, configuration fields and the core events it handles. The folder id is the lowercase, hyphenated form of its folder name (for example, `Inventory-Provider` uses `inventory-provider`).

The module entry point is CommonJS `server.cjs` so it can be loaded by the Node.js server runtime from the deployed integration folder. It must export:

- `testConnection(context)` — returns `{ ok: boolean, message: string }`.
- `handleEvent({ event, payload }, context)` — handles one declared core event.

The server context contains the module id/name/version, configured endpoint, non-secret settings and decrypted secrets. It is only passed server-side and must never be returned to the browser or written to logs. Keep provider SDKs and provider-specific request/response types inside the module folder. Modules are trusted server code: review their source and dependencies before installing them.

## Lifecycle and security

1. Install the complete module folder into `/integrations` and deploy the application. Discovery is server-side and reads module manifests from the deployed filesystem.
2. The Staff Portal lists valid installed modules and their manifest-defined configuration fields.
3. Save configuration, test the connection, then enable the module. Disabling a module stops its core-event handlers without deleting its configuration.
4. Only users with `integrations.manage` can view, configure, test, enable or disable modules.
5. Secret values are encrypted at rest using AES-256-GCM. Configure a strong, persistent `INTEGRATIONS_ENCRYPTION_KEY` environment secret before saving any integration secrets. Generate one with `openssl rand -base64 32`. Keep it stable; changing it without re-encrypting stored values makes existing secrets unreadable.
6. Do not commit credentials. Do not put secrets in manifest files, settings JSON, event payloads, browser responses or logs.

## Core event contract

A module declares the exact event names it handles in the manifest `events` array. The core backend exposes `dispatchIntegrationEvent(event, payload)`; it invokes only enabled modules that declare that event. Each handler receives a single event and payload. Errors are isolated per module and returned to the caller so one module cannot prevent other modules from running.

The event names currently reserved for future wiring include `account.password_reset_requested`, `account.invitation_created`, `staff.invitation_created`, `enquiry.received`, `quote.issued`, `invoice.issued` and `booking.confirmed`. Password recovery, password-change and staff-invitation workflows already emit their corresponding core events. Other events are declared for future wiring; adding a module does not silently change those core workflows.

## Runtime boundary

The core manager reads manifests, validates module structure, stores settings and controls activation. It does not import provider code into unrelated application features. Provider communication must go through the module's server entry point. All modules run in the trusted application server process; do not install unreviewed code.
