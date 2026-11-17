-- Executive-role assignment is a configurable capability, not a role-name bypass.
INSERT INTO public.permissions(permission_key,description)
VALUES ('roles.assign_executive','Assign and manage staff accounts using executive-level roles.')
ON CONFLICT(permission_key) DO UPDATE SET description=EXCLUDED.description;

INSERT INTO public.user_role_permissions(role_key,permission_key)
VALUES
 ('ceo_founder','roles.assign_executive'),
 ('website_development_specialist','roles.assign_executive'),
 ('senior_manager','roles.assign_executive')
ON CONFLICT DO NOTHING;
