-- Shared registry for optional integrations discovered under /integrations.
-- The service-role backend is the only database access path; no browser policy is granted.
create table if not exists public.app_integrations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  description text not null default '',
  endpoint text not null default '',
  secret text not null default '',
  active boolean not null default false,
  settings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.app_integrations enable row level security;

insert into public.permissions(permission_key,description)
values ('integrations.manage','Discover, configure, enable and disable installed integration modules.')
on conflict(permission_key) do update set description=excluded.description;

insert into public.user_role_permissions(role_key,permission_key)
values ('website_development_specialist','integrations.manage')
on conflict do nothing;
