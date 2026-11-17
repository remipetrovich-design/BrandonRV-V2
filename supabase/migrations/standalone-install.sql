-- A.L.I.S. standalone Supabase database setup
-- Run in the target Supabase project's SQL Editor.
-- Creates shared installation-level license storage. Does not insert a license key.

begin;

create table if not exists public.alis_installation_licenses (
  installation_id text primary key
    check (char_length(installation_id) between 1 and 256),
  product_slug text not null,
  component_slug text not null,
  license_key text not null,
  license_status text not null default 'valid'
    check (license_status in ('valid', 'invalid', 'unavailable')),
  license_id text,
  authority text,
  checked_at timestamptz,
  expires_at timestamptz,
  validation_metadata jsonb not null default '{}'::jsonb,
  updated_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists alis_installation_licenses_product_idx
  on public.alis_installation_licenses (product_slug, component_slug);

alter table public.alis_installation_licenses enable row level security;

revoke all on table public.alis_installation_licenses from anon, authenticated;
grant all on table public.alis_installation_licenses to service_role;

comment on table public.alis_installation_licenses is
  'A.L.I.S. server-only license configuration. Never expose through browser roles.';

create table if not exists public.alis_license_events (
  id uuid primary key default gen_random_uuid(),
  installation_id text not null,
  actor_id uuid,
  action text not null
    check (action in (
      'license_activated',
      'license_replaced',
      'license_cleared',
      'license_revalidated'
    )),
  license_id text,
  validation_code text,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists alis_license_events_installation_created_idx
  on public.alis_license_events (installation_id, created_at desc);

alter table public.alis_license_events enable row level security;

revoke all on table public.alis_license_events from anon, authenticated;
grant all on table public.alis_license_events to service_role;

comment on table public.alis_license_events is
  'Server-written audit events for A.L.I.S. installation license changes.';

commit;
