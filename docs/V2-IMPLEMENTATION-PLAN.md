# Brandon RV V2 — Implementation Plan

This is the active V2 implementation plan. Work only in `BrandonRV-V2`. Do not inspect or modify V1. Preserve the existing UI and the two portal areas: (1) Main Website with Customer Portal, and (2) Employee / Business Portal.

## Initial operating model
- Initial internal operating team: Chris (business owner) and Lucas (technical/developer support). Customer accounts are not limited to two.
- Keep one canonical identity in `public.users`; customers and staff are compatibility views/roles on that identity, not separate login systems.
- Keep the ability to add staff later, but defer payroll, leave, onboarding, employee assets and complex HR workflows from launch-critical scope.
- Supplier accounts and purchasing remain future scope. Do not make supplier management a launch dependency.

## Infrastructure and operating boundaries
- V2 repository: `remipetrovich-design/BrandonRV-V2`, branch `main`.
- Supabase project: `Brandon RV` (`thkxalrsklgademwrrlq`). It is currently shared with V1.
- The old shared Supabase project was inspected only to understand the existing V2 implementation. V2 is now required to use a separate Supabase project; V1's database, auth, storage and keys must remain untouched. See [V2 Database Architecture](./V2-DATABASE-ARCHITECTURE.md) for the intended relationship map and migration boundary. The new V2 project must receive a clean schema from this repository's migrations.
- Keep V2 changes isolated by naming and scoping any new V2-specific database objects. Review RLS, grants, foreign keys, and impact on V1 before proposing schema changes.
- Do not apply Supabase migrations or alter live schema without explicit approval. Migration files may be prepared in the V2 repository for review.
- Do not deploy to production unless explicitly requested.
- Stage 8 (full testing/hardening) is not authorised yet. Normal build, typecheck, and focused regression tests remain part of development and are not Stage 8.

## Staged delivery plan
1. **Backend foundation** — shared domain/service conventions; input validation; permission enforcement; atomic state changes; audit history; idempotency; consistent errors; safe database boundaries.
2. **Quote engine** — quote creation, pricing, labour/parts, travel/freight, GST configuration, revisions, approvals, issue, customer acceptance/decline.
3. **Job / Workcard engine** — one Workcard per accepted quote; lifecycle, tasks, assignments, work records, variations, approvals, completion.
4. **Booking engine** — availability, operating hours, travel buffers, conflicts, requests, confirmations, rescheduling and cancellation.
5. **Parts / supplier engine** — quoted parts, ordering and receiving states, backorders, returns, job costing. Full supplier management/order arrangements remain a future item.
6. **Invoice / payment engine** — invoice from approved completed work, balances, payments, deposits, refunds and receipts.
7. **Business automation** — notifications, reminders, follow-ups, dashboards and reports.
8. **Testing / hardening** — end-to-end workflows, permissions, consistency, failure handling and security. **Do not start without explicit user permission.**

## Business decisions and placeholders
- Service list and pricing: “Placeholder 4 chris to fill later”.
- GST registration and rate: “Placeholder 4 chris to fill later”. Do not assume GST applies or invent a rate.
- Supplier names and ordering arrangements: “Future thing”.
- Parts, freight and deposits paid before ordering: configurable in Business Settings; do not hardcode policy.
- Approval authority: Supervisors+.

## Current implementation notes
- Preliminary quote and Workcard engines, booking rules, business-policy configuration, and a shared audit table already exist. These are foundations, not a declaration that Stages 1–3 are complete.
- The unified License Manager API base is hardcoded as `https://incendiarynetworks.cc/api/v1`; the live endpoint contract still needs independent verification.
- Stage 1 progress: documented the canonical user/staff model and V2 data architecture; V2 database isolation from V1 is now a required foundation step; added shared API validation helpers for UUIDs, calendar dates, plain objects, trimmed strings and finite numbers; adopted shared UUID/date validation in staff, quote, Workcard and customer APIs; corrected the audit-event persistence test to assert the wrapped database error through `cause`. CI run #112 passed tests, typecheck and build on commit `591e0b1`; later route refactors are running through CI separately. No schema migration was needed for this slice, and no live schema was changed. Next: standardise permission checks, audit writes, atomic multi-record operations and idempotent request handling. Reuse existing tables and RPCs where suitable; only add a V2-scoped table if inspection proves it is needed.
