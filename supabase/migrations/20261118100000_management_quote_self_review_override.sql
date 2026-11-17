-- Allow the canonical management ranks to override the independent quote-review rule.
-- The API still requires quotes.approve; this database function independently validates the actor.
CREATE OR REPLACE FUNCTION public.review_quote(
  p_quote_id uuid,
  p_business_id uuid,
  p_actor_user_id uuid,
  p_decision text,
  p_note text DEFAULT NULL
)
RETURNS jsonb
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

  SELECT id, status, senior_approval_status, prepared_by, enquiry_id
    INTO v_quote
    FROM public.quotes
   WHERE id = p_quote_id AND business_id = p_business_id
   FOR UPDATE;

  IF NOT FOUND OR v_quote.status <> 'draft' OR v_quote.senior_approval_status <> 'pending' THEN
    RAISE EXCEPTION 'This quote is not awaiting senior review.' USING ERRCODE = 'P0001';
  END IF;

  SELECT id, user_role, status, employment_status
    INTO v_actor
    FROM public.users
   WHERE id = p_actor_user_id AND status = 'active';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'An active authorised reviewer is required.' USING ERRCODE = '42501';
  END IF;

  IF v_quote.prepared_by = p_actor_user_id THEN
    IF v_actor.user_role IN ('ceo_founder','website_development_specialist','owner','website_developer') THEN
      v_self_review_override := true;
    ELSIF v_actor.user_role IN ('office_manager','manager','senior_manager','administrator','general_manager')
       AND v_actor.employment_status = 'active' THEN
      v_self_review_override := true;
    ELSE
      RAISE EXCEPTION 'A different authorised senior staff member must review this quote.' USING ERRCODE = 'P0001';
    END IF;
    IF length(trim(coalesce(p_note,''))) < 5 THEN
      RAISE EXCEPTION 'Add a reason for overriding the independent senior review.' USING ERRCODE = '22023';
    END IF;
  END IF;

  IF v_quote.enquiry_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.enquiries e
     WHERE e.id = v_quote.enquiry_id AND e.business_id = p_business_id
       AND e.request_type = 'quote_request' AND e.archived_at IS NULL
  ) THEN
    RAISE EXCEPTION 'This quote is not attached to an active Quote Request Jobcard.' USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.quotes
     SET senior_approval_status = p_decision,
         senior_approved_by = CASE WHEN p_decision = 'approved' THEN p_actor_user_id ELSE NULL END,
         senior_approved_at = CASE WHEN p_decision = 'approved' THEN v_now ELSE NULL END,
         senior_approval_note = NULLIF(left(trim(coalesce(p_note,'')),2000),''),
         updated_at = v_now
   WHERE id = p_quote_id AND business_id = p_business_id;

  INSERT INTO public.audit_events
    (business_id, actor_user_id, action, entity_type, entity_id, details)
  VALUES
    (p_business_id, p_actor_user_id,
     CASE WHEN p_decision = 'approved' THEN 'quote.senior_approved' ELSE 'quote.returned_for_revision' END,
     'quote', p_quote_id,
     jsonb_build_object(
       'decision',p_decision,
       'note',NULLIF(left(trim(coalesce(p_note,'')),2000),''),
       'reviewed_at',v_now,
       'self_review_override',v_self_review_override,
       'reviewer_role',v_actor.user_role
     ));

  RETURN jsonb_build_object('success',true,'decision',p_decision,'reviewed_at',v_now,
    'self_review_override',v_self_review_override);
END;
$$;

REVOKE ALL ON FUNCTION public.review_quote(uuid, uuid, uuid, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.review_quote(uuid, uuid, uuid, text, text) TO service_role;
