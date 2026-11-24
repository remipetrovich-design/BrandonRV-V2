-- Staff Portal integration management permission and disabled-by-default activation.
alter table public.app_integrations alter column active set default false;
insert into public.permissions(permission_key,description)
values ('integrations.manage','Discover, configure, enable and disable installed integration modules.')
on conflict(permission_key) do update set description=excluded.description;
insert into public.user_role_permissions(role_key,permission_key)
values ('website_development_specialist','integrations.manage')
on conflict do nothing;
