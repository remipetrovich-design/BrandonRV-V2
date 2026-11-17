-- Controlled operational preparation and ticket-message attachments.
-- Preparation records never approve quotes, confirm bookings, issue invoices or authorise purchases.
INSERT INTO public.permissions(permission_key,description) VALUES
 ('jobs.prepare','Prepare Workcard details, parts requests and proposed scheduling without changing financial or approval authority.'),
 ('workflow.bypass_customer_approval','Management-only authority to bypass a customer approval gate with a recorded reason.')
ON CONFLICT(permission_key) DO UPDATE SET description=EXCLUDED.description;

INSERT INTO public.user_role_permissions(role_key,permission_key)
SELECT role_key,'jobs.prepare'
FROM unnest(ARRAY['trial_apprentice','apprentice','senior_apprentice','team_leader','supervisor','office_admin','office_supervisor','office_manager','manager','senior_manager','administrator','general_manager','ceo_founder','website_development_specialist']) AS roles(role_key)
WHERE EXISTS(SELECT 1 FROM public.user_roles r WHERE r.role_key=roles.role_key)
ON CONFLICT DO NOTHING;

INSERT INTO public.user_role_permissions(role_key,permission_key)
SELECT roles.role_key,'workflow.bypass_customer_approval'
FROM unnest(ARRAY['ceo_founder','website_development_specialist','senior_manager']) AS roles(role_key)
WHERE EXISTS(SELECT 1 FROM public.user_roles r WHERE r.role_key=roles.role_key)
ON CONFLICT DO NOTHING;

CREATE TABLE IF NOT EXISTS public.job_preparation_items (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
 job_id uuid NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
 item_type text NOT NULL CHECK(item_type IN ('note','checklist','parts_request','schedule_proposal')),
 title text NOT NULL CHECK(length(btrim(title)) BETWEEN 2 AND 160),
 details text NOT NULL DEFAULT '' CHECK(length(details) <= 3000),
 status text NOT NULL DEFAULT 'prepared' CHECK(status IN ('prepared','queued','awaiting_authorisation','completed')),
 requested_quantity numeric(12,2),
 supplier_name text,
 estimated_cost numeric(12,2),
 proposed_start timestamptz,
 created_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
 updated_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 CHECK(requested_quantity IS NULL OR requested_quantity > 0),
 CHECK(estimated_cost IS NULL OR estimated_cost >= 0),
 CHECK(item_type='parts_request' OR (requested_quantity IS NULL AND supplier_name IS NULL AND estimated_cost IS NULL)),
 CHECK(item_type='schedule_proposal' OR proposed_start IS NULL)
);
CREATE INDEX IF NOT EXISTS job_preparation_items_job_idx
 ON public.job_preparation_items(business_id,job_id,created_at DESC);
ALTER TABLE public.job_preparation_items ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.job_preparation_items FROM anon,authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.job_preparation_items TO service_role;

CREATE TABLE IF NOT EXISTS public.ticket_message_attachments (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
 enquiry_id uuid NOT NULL REFERENCES public.enquiries(id) ON DELETE CASCADE,
 message_id uuid NOT NULL REFERENCES public.customer_messages(id) ON DELETE CASCADE,
 storage_path text NOT NULL UNIQUE,
 file_name text NOT NULL,
 mime_type text NOT NULL CHECK(mime_type IN ('image/jpeg','image/png','image/webp','application/pdf')),
 size_bytes bigint NOT NULL CHECK(size_bytes > 0 AND size_bytes <= 10485760),
 uploaded_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ticket_message_attachments_message_idx
 ON public.ticket_message_attachments(enquiry_id,message_id,created_at);
ALTER TABLE public.ticket_message_attachments ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.ticket_message_attachments FROM anon,authenticated;
GRANT SELECT,INSERT,DELETE ON public.ticket_message_attachments TO service_role;

COMMENT ON TABLE public.job_preparation_items IS
 'Operational work preparation only. A queued part request is not a purchase order and cannot commit spend.';
COMMENT ON TABLE public.ticket_message_attachments IS
 'Private files attached to customer_messages. Visibility follows the parent message internal-note flag.';
