# Brandon RV V2 — Supabase migration governance

- `supabase/migrations/` on `main` is the migration-file source of truth.
- Every schema change should be committed as a timestamped SQL migration before deployment.
- Direct dashboard/SQL schema edits are exceptions. When unavoidable, reconcile the change into a reviewed migration and document the history.
- The read-only Reconcile Supabase Migration History workflow diagnoses remote-only versions, local pending versions, and inability to parse the history. It never repairs or alters migration history.
- Remote-only versions are a hard stop for preview/apply until deliberate reconciliation is completed. Do not mark versions reverted, reset production, or blindly reapply migrations.
- Run Full Scan before deployment; use the separately confirmed migration workflow to preview and apply only after history is consistent.
- Use the existing production environment secrets and the dedicated V2 project guard. Never create duplicate credential sets.
