# Integrations

This directory is reserved for future, separately installed integrations.

No integrations are included in the core application at this stage. Do not add provider-specific code, credentials, configuration, templates or external-service dependencies here until the core backend is complete and an integration is explicitly approved.

When an integration is introduced, give it its own directory:

```text
integrations/
└── Integration-Name/
    ├── README.md
    ├── adapter/
    ├── config/
    └── tests/
```

Each installed integration must remain isolated from core business logic and expose a documented, permission-checked configuration and enable/disable lifecycle through the staff administration interface.
