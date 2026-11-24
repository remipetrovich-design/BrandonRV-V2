# Integrations

This folder is the discovery root for optional, separately installed integrations. The core application scans its immediate child folders for an `integration.json` manifest and lists valid modules in Staff Portal → Integrations.

No integration modules are installed in the core repository. Do not add demo modules, provider placeholders, provider credentials, email templates or provider-specific code here. The root `mail-configuration-module.zip` is retained separately for a future installed module.

## Module layout

```text
integrations/
├── README.md
└── Example-Module/
    ├── integration.json
    └── server.ts
```

The manifest declares an id, display name, version, description and configuration fields. Keep each module's implementation, provider adapter, configuration schema, types, documentation and tests inside its own folder. The core manager reads metadata only; provider code must integrate through the documented server adapter contract and must never be imported into unrelated core features.

Only authorised staff can change enabled state or configuration. Secret values are encrypted at rest and are never returned to the browser. An integration remains disabled until it is explicitly enabled and its required configuration is valid.
