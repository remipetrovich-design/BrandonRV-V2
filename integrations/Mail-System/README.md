# Mail System Integration

## Purpose

This folder owns the Brandon RV V2 connection to the existing OrbitFS Mail System.

The application uses this integration for transactional email delivery and for retrieving the live sender-mailbox assignments used by email templates. Sender mailbox IDs must be validated against the current Mail System directory before sending.

## Current status

The integration is documented as the intended transactional mail provider. Delivery must remain paused until the existing integration values are configured and tested:

- `ORBITFS_MAIL_URL`
- `BRANDONSRV_MAIL_API_KEY`

Do not enable outbound mail while either value is missing or invalid. Do not commit either value to this repository.

## Responsibilities

- Own the Mail System API client/adapter and provider-specific request/response types.
- Validate connection configuration without exposing the API key.
- Retrieve available sender mailbox assignments.
- Validate selected sender mailbox IDs against the live directory.
- Send transactional messages through the Mail System.
- Normalize provider errors into application-safe integration errors.
- Provide a connection/health result suitable for the admin Integrations page.

## Application boundary

Application features should use the Mail System adapter from this folder. They should not make direct provider HTTP requests or depend on provider-specific response formats.

Email template content, event-to-template assignments and Brandon RV branding remain application/business configuration. They are not owned by this provider integration.

## Verification

Before enabling delivery, verify the configured endpoint and key, sender-directory retrieval, sender ID validation and a controlled test email. Confirm failure handling for missing configuration, authentication errors, provider outages and rejected recipients.
