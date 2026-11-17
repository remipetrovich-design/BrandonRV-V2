# Customer Portal Records & Release Boundaries

## Customer record ownership

The customer portal is authenticated and reads customer records using the signed-in user ID. The customer Jobcard detail route first resolves the Jobcard by both record ID and owner user ID. Quotes, appointments, Workcards, invoices and customer-visible work entries are then loaded only through the Jobcard's linked records and the signed-in user relationship.

Customer-visible documents require both an authenticated customer account and a customer profile linked to that account. The document must be marked customer-visible and belong to the signed-in user or their customer profile. File access is delivered through a short-lived signed URL; storage paths are not exposed as public URLs.

Vehicle records are read and changed through customer-scoped API routes. Profile changes are limited to the authenticated customer's own user record. Quote responses are validated against the quote owner and processed by the database response functions.

## Jobcard record sequence

A quote request creates the customer Jobcard. Quote revisions and variations remain attached to that Jobcard. Accepted quotes can be used to request a booking. Workcards are linked to the accepted quote or appointment. The customer view exposes only customer-visible Workcard notes, entries and attachments. Customer work approval is recorded through the Workcard approval RPC.

Issued invoices, payment records, refunds and credit notes are visible in the customer's invoice history and Jobcard closeout summary. The Jobcard closeout summary reconciles gross payments, refunds and credits to the remaining balance.

## Dashboard counts and recent activity

The customer dashboard displays exact counts for Jobcards, quotes and booking records. Recent activity panels remain limited to the latest five records so the dashboard stays concise without presenting those five records as the account total.

## Owner-configurable business data

The portal does not require business-plan worksheets or hard-coded customer, staff, supplier, service, pricing, tax or payment-provider records. Those details remain owner-managed through the application. Empty states are expected before the owner configures the business and before customers create real records.

## Release boundary

This document describes the implemented portal data paths and intended ownership boundaries. It is not an end-to-end test report. No manual or automated tests were run for this stage, no production deployment was performed, and no database migration was applied. Production SSO/public access, live email, payment-provider activation and production migrations remain separate approval items.
