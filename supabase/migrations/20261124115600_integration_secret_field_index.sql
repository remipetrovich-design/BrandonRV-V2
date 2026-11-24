-- Track which manifest secret fields have values without decrypting them for the staff UI.
ALTER TABLE public.app_integrations
  ADD COLUMN IF NOT EXISTS secret_fields jsonb NOT NULL DEFAULT '[]'::jsonb;