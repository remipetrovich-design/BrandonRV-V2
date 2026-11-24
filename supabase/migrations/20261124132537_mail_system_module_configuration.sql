-- Brandon RV V2: host-owned Mail System configuration.
-- The integration manager stores the central API key encrypted in app_integrations.
-- These tables store application-owned templates, revisions, triggers, routes and settings.
create table if not exists public.app_mail_templates (
  id uuid primary key default gen_random_uuid(),
  template_key text not null unique,
  display_name text not null,
  subject text not null default '',
  body_text text,
  body_html text,
  variables jsonb not null default '[]'::jsonb,
  active boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists public.app_mail_template_revisions (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references public.app_mail_templates(id) on delete cascade,
  revision integer not null check (revision > 0),
  snapshot jsonb not null,
  created_at timestamptz not null default now(),
  unique (template_id, revision)
);
create table if not exists public.app_mail_routes (
  id uuid primary key default gen_random_uuid(),
  route_key text not null unique,
  sender_address text not null,
  priority integer not null default 0,
  conditions jsonb not null default '{}'::jsonb,
  active boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists app_mail_routes_active_priority_idx on public.app_mail_routes(active, priority desc);
create table if not exists public.app_mail_triggers (
  id uuid primary key default gen_random_uuid(),
  event_key text not null unique,
  template_key text not null references public.app_mail_templates(template_key),
  route_key text references public.app_mail_routes(route_key) on delete set null,
  recipient_mapping jsonb not null default '{}'::jsonb,
  active boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists app_mail_triggers_active_event_idx on public.app_mail_triggers(active, event_key);
create table if not exists public.app_mail_settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);
insert into public.app_mail_settings(key,value)
values ('module', jsonb_build_object(
  'enabled', false,
  'defaultSender', null,
  'appearance', jsonb_build_object(
    'primaryColor','#253858','accentColor','#3978d4','surfaceColor','#ffffff',
    'textColor','#172033','borderColor','#d9e0ea','borderRadius','12px',
    'fontFamily','inherit','title','Mail settings','subtitle','Configure application email'
  )
))
on conflict (key) do nothing;

create or replace function public.mail_configuration_set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;
drop trigger if exists app_mail_templates_set_updated_at on public.app_mail_templates;
create trigger app_mail_templates_set_updated_at before update on public.app_mail_templates
for each row execute function public.mail_configuration_set_updated_at();
drop trigger if exists app_mail_routes_set_updated_at on public.app_mail_routes;
create trigger app_mail_routes_set_updated_at before update on public.app_mail_routes
for each row execute function public.mail_configuration_set_updated_at();
drop trigger if exists app_mail_triggers_set_updated_at on public.app_mail_triggers;
create trigger app_mail_triggers_set_updated_at before update on public.app_mail_triggers
for each row execute function public.mail_configuration_set_updated_at();
drop trigger if exists app_mail_settings_set_updated_at on public.app_mail_settings;
create trigger app_mail_settings_set_updated_at before update on public.app_mail_settings
for each row execute function public.mail_configuration_set_updated_at();

alter table public.app_mail_templates enable row level security;
alter table public.app_mail_template_revisions enable row level security;
alter table public.app_mail_routes enable row level security;
alter table public.app_mail_triggers enable row level security;
alter table public.app_mail_settings enable row level security;

create or replace function public.app_mail_save_template_with_revision(p_template jsonb)
returns public.app_mail_templates
language plpgsql security invoker set search_path = public as $$
declare v_template public.app_mail_templates; v_revision integer; v_id uuid;
begin
  v_id := nullif(p_template->>'id','')::uuid;
  if v_id is null then
    insert into public.app_mail_templates(template_key,display_name,subject,body_text,body_html,variables,active)
    values(p_template->>'template_key',p_template->>'display_name',p_template->>'subject',
      nullif(p_template->>'body_text','null'),nullif(p_template->>'body_html','null'),
      coalesce(p_template->'variables','[]'::jsonb),coalesce((p_template->>'active')::boolean,false))
    returning * into v_template;
  else
    update public.app_mail_templates set
      template_key=p_template->>'template_key', display_name=p_template->>'display_name',
      subject=p_template->>'subject',
      body_text=case when p_template->'body_text' is null or p_template->'body_text'='null'::jsonb then null else p_template->>'body_text' end,
      body_html=case when p_template->'body_html' is null or p_template->'body_html'='null'::jsonb then null else p_template->>'body_html' end,
      variables=coalesce(p_template->'variables','[]'::jsonb),
      active=coalesce((p_template->>'active')::boolean,false)
    where id=v_id returning * into v_template;
    if not found then raise exception 'Template not found or access denied'; end if;
  end if;
  perform 1 from public.app_mail_templates where id=v_template.id for update;
  select coalesce(max(revision),0)+1 into v_revision from public.app_mail_template_revisions where template_id=v_template.id;
  insert into public.app_mail_template_revisions(template_id,revision,snapshot)
    values(v_template.id,v_revision,to_jsonb(v_template));
  return v_template;
end;
$$;
create or replace function public.app_mail_restore_template_revision(p_template_id uuid,p_revision integer)
returns public.app_mail_templates
language plpgsql security invoker set search_path = public as $$
declare v_snapshot jsonb;
begin
  select snapshot into v_snapshot from public.app_mail_template_revisions
    where template_id=p_template_id and revision=p_revision;
  if v_snapshot is null then raise exception 'Template revision not found'; end if;
  return public.app_mail_save_template_with_revision(v_snapshot || jsonb_build_object('id',p_template_id));
end;
$$;
revoke all on function public.app_mail_save_template_with_revision(jsonb) from public;
revoke all on function public.app_mail_restore_template_revision(uuid,integer) from public;
grant execute on function public.app_mail_save_template_with_revision(jsonb) to service_role;
grant execute on function public.app_mail_restore_template_revision(uuid,integer) to service_role;
