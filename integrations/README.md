# Integrations

This directory is the dedicated home for external service integrations used by Brandon RV V2.

Each integration must live in its own named directory. Keep its implementation, configuration schema, adapter/client, types, documentation and integration-specific tests together. Do not place one provider's implementation inside another provider's folder.

## Structure

```text
integrations/
├── README.md
├── Mail-System/
│   └── README.md
└── Plugin2/
    └── README.md
```

## Integration boundaries

- Each integration owns its provider-specific API communication and data mapping.
- Application features should call an integration through a stable adapter/interface rather than importing provider SDK details throughout the application.
- Keep credentials and secrets in environment configuration or the authorised secret store. Never commit credentials.
- Keep provider configuration separate from business feature configuration.
- An integration must expose its connection/configuration status without returning secret values.
- Document required environment variables, permissions/scopes, setup, failure behaviour and test coverage in that integration's folder.
- Integration-specific tests belong alongside the integration or in the central test suite with clear naming.

## Adding an integration

1. Create `integrations/<Integration-Name>/`.
2. Add a README describing purpose, provider, setup, configuration and exposed capabilities.
3. Implement the provider adapter and types inside that folder.
4. Add tests for successful requests, invalid configuration, provider errors and unavailable services.
5. Connect application features through the adapter; do not duplicate provider calls in UI components.
6. Register the integration in the application's integration catalogue/status service where required.

The folder is the source-code boundary for integrations. It does not imply that an integration is enabled or connected in production.
