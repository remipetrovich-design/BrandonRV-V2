-- Rebuild the non-user baseline after a deliberate first-install data reset.
-- No owner, staff, customer, session, job, quote, invoice or other operational records are created.

INSERT INTO public.businesses(name,slug,brand_line,phone,public_email,city,region,status)
VALUES ('Brandon RV','brandon-rv','From Factory Experience to Repairs On The Go','0407 189 087','enquires@brandonrv.com.au','Tamworth','NSW','prelaunch')
ON CONFLICT (slug) DO NOTHING;

INSERT INTO public.business_settings(business_id,settings)
SELECT id,jsonb_build_object(
 'timezone','Australia/Sydney',
 'booking_requires_confirmation',true,
 'public_email_verification_required',true,
 'service_scope_approval_required',true
)
FROM public.businesses WHERE slug='brandon-rv'
ON CONFLICT (business_id) DO NOTHING;

INSERT INTO public.permissions(permission_key,description) VALUES
 ('website.manage','Edit and publish public website content'),
 ('business.settings.manage','Manage business settings and service areas'),
 ('customers.manage','Manage customer records and vehicles'),
 ('enquiries.manage','Review and respond to enquiries'),
 ('quotes.manage','Create and manage quotes'),
 ('appointments.manage','Manage appointments and calendar'),
 ('jobs.manage','Manage jobs and job records'),
 ('documents.manage','Manage business and customer documents'),
 ('invoices.manage','Create and manage invoices'),
 ('payments.manage','Record and review payments'),
 ('staff.manage','Invite staff and manage access'),
 ('reports.view','View business reports'),
 ('expenses.manage','Manage business expenses'),
 ('customers.view','View customer records'),
 ('vehicles.view','View customer vehicles'),
 ('vehicles.manage','Manage customer vehicles'),
 ('enquiries.view','View service enquiries'),
 ('quotes.view','View quotes'),
 ('quotes.approve','Approve and issue quotes'),
 ('appointments.view','View appointments'),
 ('jobs.view','View jobs'),
 ('jobs.assign','Assign staff to jobs'),
 ('jobs.complete','Complete job tasks and status'),
 ('time.view','View staff time entries'),
 ('time.manage','Manage and approve time entries'),
 ('invoices.view','View invoices'),
 ('expenses.view','View expenses'),
 ('suppliers.view','View suppliers'),
 ('suppliers.manage','Manage suppliers and purchase orders'),
 ('staff.view','View staff records'),
 ('roles.manage','Manage roles and permissions'),
 ('settings.manage','Manage business settings'),
 ('documents.view','View permitted documents'),
 ('communications.manage','Manage customer communications'),
 ('leave.view','View leave balances and requests'),
 ('leave.manage','Manage and approve leave'),
 ('assets.view','View employee assets'),
 ('assets.manage','Manage employee asset allocations'),
 ('payroll.view','View payroll preparation'),
 ('payroll.manage','Manage and approve payroll preparation'),
 ('onboarding.view','View onboarding tasks'),
 ('onboarding.manage','Manage onboarding tasks'),
 ('time.clock','Clock in and out for own shifts'),
 ('jobs.approve','Approve or return Workcards and operational job reviews')
ON CONFLICT (permission_key) DO NOTHING;

INSERT INTO public.user_roles(role_key,name,description,is_system) VALUES
 ('customer','Customer','Default permanent customer identity; not removable.',true),
 ('trial_apprentice','Trial Apprentice','Entry-level supervised workshop role.',true),
 ('apprentice','Apprentice','Apprentice workshop role.',true),
 ('senior_apprentice','Senior Apprentice','Advanced apprentice workshop role.',true),
 ('team_leader','Team Leader','Leads an assigned team and coordinates work.',true),
 ('supervisor','Supervisor','Supervises workshop operations and staff.',true),
 ('office_admin','Office Admin','Office administration and customer coordination.',true),
 ('office_supervisor','Office Supervisor','Supervises office operations.',true),
 ('office_manager','Office Manager','Manages office and administrative operations.',true),
 ('manager','Manager','Business operations management.',true),
 ('senior_manager','Senior Manager','Senior business operations management.',true),
 ('website_development_specialist','Website Development Specialist','Unrestricted access across the entire Brandon RV system.',true),
 ('ceo_founder','CEO / Founder','Unrestricted access across the entire Brandon RV system.',true)
ON CONFLICT (role_key) DO UPDATE SET
 name=EXCLUDED.name,description=EXCLUDED.description,is_system=true;

WITH baseline(permission_key) AS (
 SELECT unnest(ARRAY['appointments.view','assets.view','documents.view','enquiries.view','jobs.complete','jobs.view','leave.view','onboarding.view','time.clock','vehicles.view'])
)
INSERT INTO public.user_role_permissions(role_key,permission_key)
SELECT roles.role_key,baseline.permission_key
FROM unnest(ARRAY['trial_apprentice','apprentice','senior_apprentice']) AS roles(role_key)
CROSS JOIN baseline
JOIN public.permissions p ON p.permission_key=baseline.permission_key
ON CONFLICT DO NOTHING;

INSERT INTO public.user_role_permissions(role_key,permission_key)
SELECT 'team_leader',p.permission_key FROM public.permissions p
WHERE p.permission_key IN ('appointments.view','appointments.manage','jobs.view','jobs.assign','jobs.manage','staff.view','time.approve','assets.view','reports.view')
ON CONFLICT DO NOTHING;

INSERT INTO public.user_role_permissions(role_key,permission_key)
SELECT 'supervisor',p.permission_key FROM public.permissions p
WHERE p.permission_key LIKE ANY(ARRAY['appointments.%','assets.%','documents.%','enquiries.%','jobs.%','leave.%','onboarding.%','staff.%','time.%','vehicles.%','reports.%'])
ON CONFLICT DO NOTHING;

INSERT INTO public.user_role_permissions(role_key,permission_key)
SELECT roles.role_key,p.permission_key
FROM unnest(ARRAY['office_admin','office_supervisor']) AS roles(role_key)
CROSS JOIN public.permissions p
WHERE p.permission_key LIKE ANY(ARRAY['customers.%','vehicles.%','enquiries.%','quotes.%','appointments.%','documents.%','invoices.view','payments.view','suppliers.view'])
ON CONFLICT DO NOTHING;

INSERT INTO public.user_role_permissions(role_key,permission_key)
SELECT 'office_supervisor',p.permission_key FROM public.permissions p
WHERE p.permission_key LIKE ANY(ARRAY['staff.view','leave.%','time.%','reports.%','invoices.manage','payments.manage'])
ON CONFLICT DO NOTHING;

INSERT INTO public.user_role_permissions(role_key,permission_key)
SELECT roles.role_key,p.permission_key
FROM unnest(ARRAY['office_manager','manager','senior_manager']) AS roles(role_key)
CROSS JOIN public.permissions p
WHERE p.permission_key NOT IN ('roles.manage')
ON CONFLICT DO NOTHING;

INSERT INTO public.site_pages(business_id,slug,title,content,is_published,sort_order)
SELECT b.id,p.slug,p.title,p.content::jsonb,false,p.sort_order
FROM public.businesses b
CROSS JOIN (VALUES
 ('home','Home','{"hero_title":"Brandon RV","hero_subtitle":"From Factory Experience to Repairs On The Go","intro":"Mobile caravan and motorhome interior repairs and suitable accessory work around Tamworth NSW.","primary_action":"Request a quote","publication_note":"Draft content — owner approval required"}',1),
 ('about','About Brandon RV','{"intro":"A mobile caravan and motorhome interior repair and accessory service based in Tamworth NSW.","publication_note":"Verify experience and qualification wording before publication"}',2),
 ('services','Services','{"intro":"Only services approved by the owner and confirmed as within legal, insurance and competency requirements should be published."}',3),
 ('service-areas','Service Areas','{"base":"Tamworth NSW","proposed_radius_km":20,"publication_note":"Proposed radius only — validate before publication"}',4),
 ('how-it-works','How It Works','{"steps":["Submit an enquiry and vehicle details","Brandon RV reviews the request","Receive a quote or inspection proposal","Approve the scope and any parts costs","Appointment is confirmed","Work is completed and checked","Invoice and payment"]}',5),
 ('gallery','Previous Work','{"publication_note":"Only genuine work photographs with customer permission may be published."}',6),
 ('faq','Frequently Asked Questions','{"items":[]}',7),
 ('contact','Contact','{"phone":"0407 189 087","email":"enquires@brandonrv.com.au","publication_note":"Verify email spelling and mailbox before publication"}',8)
) AS p(slug,title,content,sort_order)
WHERE b.slug='brandon-rv'
ON CONFLICT (business_id,slug) DO NOTHING;

INSERT INTO public.leave_types(business_id,name,paid,annual_entitlement_days)
SELECT id,'Annual leave',true,NULL FROM public.businesses WHERE slug='brandon-rv'
ON CONFLICT (business_id,name) DO NOTHING;
INSERT INTO public.leave_types(business_id,name,paid,annual_entitlement_days)
SELECT id,'Personal / carer''s leave',true,NULL FROM public.businesses WHERE slug='brandon-rv'
ON CONFLICT (business_id,name) DO NOTHING;
INSERT INTO public.leave_types(business_id,name,paid,annual_entitlement_days)
SELECT id,'Unpaid leave',false,NULL FROM public.businesses WHERE slug='brandon-rv'
ON CONFLICT (business_id,name) DO NOTHING;

