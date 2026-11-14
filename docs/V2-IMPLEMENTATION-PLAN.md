# Brandon RV V2 — Implementation Plan

This is the active V2 implementation plan. Work only in `BrandonRV-V2`. Do not inspect or modify V1. Preserve the existing UI and the two portal areas: (1) Main Website with Customer Portal, and (2) Employee / Business Portal.

## Initial operating model
- Initial internal operating team: Chris (business owner) and Lucas (technical/developer support). Customer accounts are not limited to two.
- Keep one canonical identity in `public.users`; customers and staff are compatibility views/roles on that identity, not separate login systems.
- Keep the ability to add staff later, but defer payroll, leave, onboarding, employee assets and complex HR workflows from launch-critical scope.
- Supplier accounts and purchasing remain future scope. Do not make supplier management a launch dependency.

## Infrastructure and operating boundaries
- V2 repository: `remipetrovich-design/BrandonRV-V2`, branch `main`.
- Supabase project: `Brandon-RV-V2` (`lciylmfpcefdpsouoqvm`), URL `https://lciylmfpcefdpsouoqvm.supabase.co`, region `ap-northeast-1` (Tokyo).
- V2 now has its own database, migration history, auth/storage resources and keys. V1 (`thkxalrsklgademwrrlq`) remains separate and must not be inspected or modified.
- The 61 repository migrations and one additional V2 security patch have been applied to the clean V2 project. No V1 data was copied. See [V2 Database Architecture](./V2-DATABASE-ARCHITECTURE.md) for the relationship map and migration boundary.
- All future V2 schema changes must be committed to this repository and applied only to `lciylmfpcefdpsouoqvm`.
- The user has explicitly authorised provisioning the V2 database and applying its schema. Continue applying reviewed migrations only to the dedicated V2 project; never to V1.
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
- Stage 1 progress: shared API validation helpers, audit event helpers, business policy rules and domain engines are in the repository. The new V2 Supabase project is active and isolated from V1. All 61 existing repository migrations have been applied, plus a security patch restricting `revise_job_variation_quote` to `service_role`. The new database has 57 public base tables, all RLS-enabled, a private file bucket and the Brandon RV prelaunch workspace seed. No V1 operational records were copied. The mail delivery system remains paused. Next: finish connecting the application runtime to the new V2 URL/keys, then complete the enquiry → quote → Workcard → work details → approval → invoice/payment transaction paths. Stage 8 remains unauthorised.
