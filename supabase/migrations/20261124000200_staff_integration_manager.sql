-- Staff Portal integration management permission and safe disabled default.
update public.app_integrations set active=false where active=true;
insert into public.permissions(permission_key,description)
values ('integrations.manage','Discover, configure, enable and disable installed integration modules.')
on conflict(permission_key) do update set description=excluded.description;
insert into public.user_role_permissions(role_key,permission_key)
values ('website_development_specialist','integrations.manage')
on conflict do nothing;
