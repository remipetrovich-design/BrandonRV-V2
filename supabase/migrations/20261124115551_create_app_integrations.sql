-- Create the server-only persistence table required by the Staff Portal integration manager.
CREATE TABLE IF NOT EXISTS public.app_integrations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  description text NOT NULL DEFAULT '',
  endpoint text NOT NULL DEFAULT '',
  secret text NOT NULL DEFAULT '',
  secret_fields jsonb NOT NULL DEFAULT '[]'::jsonb,
  active boolean NOT NULL DEFAULT false,
  settings jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.app_integrations IS 'Server-only configuration and encrypted credentials for installed integration modules.';
ALTER TABLE public.app_integrations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.app_integrations FROM anon, authenticated;
GRANT ALL ON TABLE public.app_integrations TO service_role;