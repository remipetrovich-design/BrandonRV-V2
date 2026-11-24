-- Email template content and sender assignments are moving into the separately installed notification module.
-- Keep the original migration files immutable for Supabase migration-history consistency.
DROP TABLE IF EXISTS public.email_templates;
DROP TABLE IF EXISTS public.email_verification_tokens;