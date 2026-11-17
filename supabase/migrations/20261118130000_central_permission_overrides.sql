-- Centralise approval and booking bypass authority in the permission catalogue.
INSERT INTO public.permissions(permission_key,description) VALUES
 ('quotes.approve_self_review','Override the independent reviewer requirement when approving a quote prepared by the same user.'),
 ('appointments.override_scheduling_restrictions','Override booking time-window and calendar-conflict restrictions.')
ON CONFLICT(permission_key) DO UPDATE SET description=EXCLUDED.description;

-- The three executive/management ranks receive explicit catalogue grants. Their
-- access is therefore visible and governed by the same permission resolver.
INSERT INTO public.user_role_permissions(role_key,permission_key)
SELECT roles.role_key,p.permission_key
FROM unnest(ARRAY['ceo_founder','website_development_specialist','senior_manager']) AS roles(role_key)
CROSS JOIN public.permissions p
ON CONFLICT DO NOTHING;

-- Deployment and migration controls are technical capabilities reserved for
-- the Website Development Specialist, separate from ordinary executive access.
INSERT INTO public.permissions(permission_key,description) VALUES
 ('developer.deploy','Dispatch and inspect Brandon RV V2 production deployments.'),
 ('developer.migrations.manage','Dispatch and inspect V2 database migration operations.')
ON CONFLICT(permission_key) DO UPDATE SET description=EXCLUDED.description;

INSERT INTO public.user_role_permissions(role_key,permission_key)
VALUES
 ('website_development_specialist','developer.deploy'),
 ('website_development_specialist','developer.migrations.manage')
ON CONFLICT DO NOTHING;

CREATE OR REPLACE FUNCTION public.user_has_effective_permission(
  p_user_id uuid,
  p_permission_key text
) RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.users u
    WHERE u.id = p_user_id
      AND u.status = 'active'
      AND (u.employment_status = 'active' OR u.user_role IN ('ceo_founder','website_development_specialist','senior_manager'))
      AND (
        EXISTS (
          SELECT 1 FROM public.user_role_permissions rp
          WHERE rp.role_key = u.user_role
            AND rp.permission_key = p_permission_key
        )
        OR EXISTS (
          SELECT 1 FROM public.user_permission_grants ug
          WHERE ug.user_id = u.id
            AND ug.permission_key = p_permission_key
            AND ug.revoked_at IS NULL
            AND (ug.expires_at IS NULL OR ug.expires_at > now())
        )
      )
  );
$$;
REVOKE ALL ON FUNCTION public.user_has_effective_permission(uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.user_has_effective_permission(uuid,text) TO service_role;

-- The database independently verifies self-review override authority. A caller
-- cannot manufacture the bypass by supplying a role label or request parameter.
CREATE OR REPLACE FUNCTION public.review_quote(
  p_quote_id uuid,
  p_business_id uuid,
  p_actor_user_id uuid,
  p_decision text,
  p_note text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_quote record;
  v_actor record;
  v_self_review_override boolean := false;
  v_now timestamptz := clock_timestamp();
BEGIN
  IF p_decision NOT IN ('approved','changes_requested') THEN
    RAISE EXCEPTION 'Choose approve or request changes.' USING ERRCODE = '22023';
  END IF;
  IF p_decision = 'changes_requested' AND length(trim(coalesce(p_note,''))) < 5 THEN
    RAISE EXCEPTION 'Describe the quote changes required.' USING ERRCODE = '22023';
  END IF;

  SELECT id,status,senior_approval_status,prepared_by,enquiry_id
    INTO v_quote
    FROM public.quotes
   WHERE id=p_quote_id AND business_id=p_business_id
   FOR UPDATE;
  IF NOT FOUND OR v_quote.status <> 'draft' OR v_quote.senior_approval_status <> 'pending' THEN
    RAISE EXCEPTION 'This quote is not awaiting senior review.' USING ERRCODE = 'P0001';
  END IF;

  SELECT id,user_role,status,employment_status
    INTO v_actor
    FROM public.users
   WHERE id=p_actor_user_id AND status='active';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'An active authorised reviewer is required.' USING ERRCODE = '42501';
  END IF;

  IF v_quote.prepared_by=p_actor_user_id THEN
    IF NOT public.user_has_effective_permission(p_actor_user_id,'quotes.approve_self_review') THEN
      RAISE EXCEPTION 'A different authorised reviewer must review this quote.' USING ERRCODE = 'P0001';
    END IF;
    v_self_review_override := true;
    IF length(trim(coalesce(p_note,''))) < 5 THEN
      RAISE EXCEPTION 'Add a reason for overriding the independent senior review.' USING ERRCODE = '22023';
    END IF;
  END IF;

  IF v_quote.enquiry_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.enquiries e
     WHERE e.id=v_quote.enquiry_id AND e.business_id=p_business_id
       AND e.request_type='quote_request' AND e.archived_at IS NULL
       AND e.status IN ('new','reviewing','quoted')
  ) THEN
    RAISE EXCEPTION 'This quote is not attached to an active Quote Request Jobcard.' USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.quotes
     SET senior_approval_status=p_decision,
         senior_approved_by=CASE WHEN p_decision='approved' THEN p_actor_user_id ELSE NULL END,
         senior_approved_at=CASE WHEN p_decision='approved' THEN v_now ELSE NULL END,
         senior_approval_note=NULLIF(left(trim(coalesce(p_note,'')),2000),''),
         updated_at=v_now
   WHERE id=p_quote_id AND business_id=p_business_id;

  INSERT INTO public.audit_events(business_id,actor_user_id,action,entity_type,entity_id,details)
  VALUES(p_business_id,p_actor_user_id,
    CASE WHEN p_decision='approved' THEN 'quote.senior_approved' ELSE 'quote.returned_for_revision' END,
    'quote',p_quote_id,
    jsonb_build_object('decision',p_decision,'note',NULLIF(left(trim(coalesce(p_note,'')),2000),''),
      'reviewed_at',v_now,'self_review_override',v_self_review_override,'reviewer_role',v_actor.user_role));

  RETURN jsonb_build_object('success',true,'decision',p_decision,'reviewed_at',v_now,
    'self_review_override',v_self_review_override);
END;
$$;
REVOKE ALL ON FUNCTION public.review_quote(uuid,uuid,uuid,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.review_quote(uuid,uuid,uuid,text,text) TO service_role;

-- Backwards-compatible overload used by the current booking APIs. The legacy
-- function still enforces ownership and workflow state; this wrapper verifies
-- any requested calendar-conflict bypass against the central permission set.
CREATE OR REPLACE FUNCTION public.update_jobcard_booking(
  p_business_id uuid,
  p_actor_user_id uuid,
  p_enquiry_id uuid,
  p_appointment_id uuid,
  p_action text,
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_location text,
  p_bypass_conflicts boolean
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_bypass_conflicts AND NOT public.user_has_effective_permission(
    p_actor_user_id,'appointments.override_scheduling_restrictions'
  ) THEN
    RAISE EXCEPTION 'You do not have permission to override booking restrictions.' USING ERRCODE = '42501';
  END IF;
  RETURN public.update_jobcard_booking(
    p_business_id,p_actor_user_id,p_enquiry_id,p_appointment_id,
    p_action,p_starts_at,p_ends_at,p_location
  );
END;
$$;
REVOKE ALL ON FUNCTION public.update_jobcard_booking(uuid,uuid,uuid,uuid,text,timestamptz,timestamptz,text,boolean) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.update_jobcard_booking(uuid,uuid,uuid,uuid,text,timestamptz,timestamptz,text,boolean) TO service_role;
