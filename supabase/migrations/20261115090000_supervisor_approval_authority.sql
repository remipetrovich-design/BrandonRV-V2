-- Supervisor-and-above approval authority for quotes and Workcards.
-- Existing global administrator roles retain their unrestricted access.
INSERT INTO public.permissions(permission_key,description)
VALUES ('jobs.approve','Approve or return Workcards and operational job reviews')
ON CONFLICT (permission_key) DO UPDATE SET description=EXCLUDED.description;

-- Supervisors can approve customer quotes. Team Leaders and workshop staff do not.
INSERT INTO public.user_role_permissions(role_key,permission_key)
VALUES
 ('supervisor','quotes.view'),
 ('supervisor','quotes.approve'),
 ('office_supervisor','quotes.approve'),
 ('office_manager','quotes.approve'),
 ('manager','quotes.approve'),
 ('senior_manager','quotes.approve'),
 ('administrator','quotes.approve'),
 ('general_manager','quotes.approve')
ON CONFLICT (role_key,permission_key) DO NOTHING;

-- Workcard setup and completed-work approval are a separate permission from
-- day-to-day job management. This prevents Team Leaders from self-elevating
-- through the broader jobs.manage permission.
INSERT INTO public.user_role_permissions(role_key,permission_key)
SELECT roles.role_key,'jobs.approve'
FROM unnest(ARRAY[
 'supervisor','office_supervisor','office_manager','manager',
 'senior_manager','administrator','general_manager'
]) AS roles(role_key)
JOIN public.user_roles r ON r.role_key=roles.role_key
ON CONFLICT (role_key,permission_key) DO NOTHING;

COMMENT ON COLUMN public.user_roles.description IS
 'Role descriptions are informational; approval authority is controlled by explicit permission grants.';
