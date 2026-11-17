# A.L.I.S. License Management Setup

The accepted key is stored once in the target website database in public.alis_installation_licenses. Every visitor uses the same installation record. No browser cookie, per-visitor key or separate encryption secret is used.

Apply the generated Supabase migration before unlocking the site. It creates server-only tables with RLS enabled and revokes all access from anon and authenticated; only service_role can read or write the key.

The integration reuses the existing server-side Supabase URL and SUPABASE_SERVICE_ROLE_KEY. The service-role key must remain server-only.

The license API validates the signed-in user against the scanned owner/admin permission table. Only an active owner/admin can view, set, replace or clear the installation key.

Middleware reads the key from the shared database and validates it with License Manager. Missing or rejected keys redirect protected requests to /license. Detected login and first-run setup paths remain available.
