-- Staff Portal integration management permission for executive and technical administrators.
alter table public.app_integrations alter column active set default false;
insert into public.permissions(permission_key,description)
values ('integrations.manage','Discover, configure, test, enable and disable installed integration modules.')
on conflict(permission_key) do update set description=excluded.description;
insert into public.user_role_permissions(role_key,permission_key)
values
 ('ceo_founder','integrations.manage'),
 ('website_development_specialist','integrations.manage'),
 ('senior_manager','integrations.manage')
on conflict do nothing;