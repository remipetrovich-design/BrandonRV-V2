-- Keep an already-issued quote active until its replacement revision is approved and issued.
-- The revision transition and superseding of the prior issued revision occur atomically.
CREATE UNIQUE INDEX IF NOT EXISTS quotes_enquiry_standard_revision_uidx
  ON public.quotes (business_id, enquiry_id, revision_number)
  WHERE enquiry_id IS NOT NULL AND quote_kind = 'standard';

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
AS $
DECLARE
  v_quote record;
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
   WHERE id = p_quote_id
     AND business_id = p_business_id
   FOR UPDATE;

  IF NOT FOUND OR v_quote.status <> 'draft' OR v_quote.senior_approval_status <> 'pending' THEN
    RAISE EXCEPTION 'This quote is not awaiting senior review.' USING ERRCODE = 'P0001';
  END IF;
  IF v_quote.prepared_by IS NOT NULL AND v_quote.prepared_by = p_actor_user_id THEN
    RAISE EXCEPTION 'A different authorised senior staff member must review this quote.' USING ERRCODE = 'P0001';
  END IF;

  IF v_quote.enquiry_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.enquiries e
     WHERE e.id = v_quote.enquiry_id
       AND e.business_id = p_business_id
       AND e.request_type = 'quote_request'
       AND e.archived_at IS NULL
       AND e.status IN ('new','reviewing','quoted')
  ) THEN
    RAISE EXCEPTION 'This quote is not attached to an active Quote Request Jobcard.' USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.quotes
     SET senior_approval_status = p_decision,
         senior_approved_by = CASE WHEN p_decision = 'approved' THEN p_actor_user_id ELSE NULL END,
         senior_approved_at = CASE WHEN p_decision = 'approved' THEN v_now ELSE NULL END,
         senior_approval_note = NULLIF(left(trim(coalesce(p_note,'')),2000),''),
         updated_at = v_now
   WHERE id = p_quote_id
     AND business_id = p_business_id;

  INSERT INTO public.audit_events
    (business_id, actor_user_id, action, entity_type, entity_id, details)
  VALUES
    (p_business_id, p_actor_user_id,
     CASE WHEN p_decision = 'approved' THEN 'quote.senior_approved' ELSE 'quote.returned_for_revision' END,
     'quote', p_quote_id,
     jsonb_build_object('decision',p_decision,'note',NULLIF(left(trim(coalesce(p_note,'')),2000),''),'reviewed_at',v_now));

  RETURN jsonb_build_object('success',true,'decision',p_decision,'reviewed_at',v_now);
END;
$;

REVOKE ALL ON FUNCTION public.review_quote(uuid, uuid, uuid, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.review_quote(uuid, uuid, uuid, text, text) TO service_role;

CREATE OR REPLACE FUNCTION public.issue_quote_for_jobcard(
  p_quote_id uuid,
  p_business_id uuid,
  p_actor_user_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_quote record;
  v_enquiry record;
  v_now timestamptz := clock_timestamp();
BEGIN
  SELECT id, business_id, enquiry_id, quote_number, status, total, revision_number, senior_approval_status
    INTO v_quote
    FROM public.quotes
   WHERE id = p_quote_id
     AND business_id = p_business_id
   FOR UPDATE;

  IF NOT FOUND OR v_quote.status <> 'draft' OR v_quote.enquiry_id IS NULL
     OR v_quote.senior_approval_status NOT IN ('approved','legacy_approved') THEN
    RAISE EXCEPTION 'Only a senior-approved draft quote attached to a Jobcard can be issued.' USING ERRCODE = 'P0001';
  END IF;

  SELECT id, request_type, stage, status, archived_at
    INTO v_enquiry
    FROM public.enquiries
   WHERE id = v_quote.enquiry_id
     AND business_id = p_business_id
   FOR UPDATE;

  IF NOT FOUND OR v_enquiry.request_type <> 'quote_request'
     OR v_enquiry.archived_at IS NOT NULL
     OR v_enquiry.status NOT IN ('new', 'reviewing', 'quoted') THEN
    RAISE EXCEPTION 'This Jobcard is not available for quoting.' USING ERRCODE = 'P0001';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.quotes q
     WHERE q.business_id = p_business_id
       AND q.enquiry_id = v_enquiry.id
       AND q.quote_kind = 'standard'
       AND q.status = 'sent'
       AND q.id <> v_quote.id
       AND q.revision_number >= v_quote.revision_number
  ) THEN
    RAISE EXCEPTION 'A newer quote revision is already issued.' USING ERRCODE = 'P0001';
  END IF;

  -- Keep the currently issued revision valid while a replacement is only a draft.
  -- Supersede earlier issued revisions atomically with issuing the new approved revision.
  WITH superseded AS (
    UPDATE public.quotes
       SET status = 'superseded',
           updated_at = v_now
     WHERE business_id = p_business_id
       AND enquiry_id = v_enquiry.id
       AND quote_kind = 'standard'
       AND status = 'sent'
       AND id <> v_quote.id
       AND revision_number < v_quote.revision_number
    RETURNING id, quote_number, revision_number
  )
  INSERT INTO public.audit_events
    (business_id, actor_user_id, action, entity_type, entity_id, details)
  SELECT p_business_id, p_actor_user_id, 'quote.superseded', 'quote', superseded.id,
         jsonb_build_object('quote_number', superseded.quote_number,
           'superseded_by_quote_id', v_quote.id,
           'new_revision_number', v_quote.revision_number)
    FROM superseded;

  UPDATE public.quotes
     SET status = 'sent',
         issue_date = (v_now AT TIME ZONE 'Australia/Sydney')::date,
         updated_at = v_now
   WHERE id = v_quote.id;

  UPDATE public.enquiries
     SET stage = 'quote_sent',
         status = 'quoted',
         updated_at = v_now
   WHERE id = v_enquiry.id
     AND business_id = p_business_id;

  IF v_enquiry.stage IS DISTINCT FROM 'quote_sent' THEN
    INSERT INTO public.enquiry_stage_history
      (business_id, enquiry_id, from_stage, to_stage, changed_by, note)
    VALUES
      (p_business_id, v_enquiry.id, v_enquiry.stage, 'quote_sent', p_actor_user_id,
       'Senior-approved quote ' || v_quote.quote_number || ' issued to the customer.');
  END IF;

  INSERT INTO public.audit_events
    (business_id, actor_user_id, action, entity_type, entity_id, details)
  VALUES
    (p_business_id, p_actor_user_id, 'quote.issued', 'quote', v_quote.id,
     jsonb_build_object('quote_number', v_quote.quote_number, 'enquiry_id', v_enquiry.id, 'total', v_quote.total));

  RETURN jsonb_build_object('success', true, 'quote_id', v_quote.id,
    'quote_number', v_quote.quote_number, 'enquiry_id', v_enquiry.id);
END;
$$;

REVOKE ALL ON FUNCTION public.issue_quote_for_jobcard(uuid, uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.issue_quote_for_jobcard(uuid, uuid, uuid) TO service_role;


-- Expired quotes cannot be accepted. Expiration is recorded atomically with the attempted response.
CREATE OR REPLACE FUNCTION public.respond_to_customer_quote(
  p_quote_id uuid,
  p_user_id uuid,
  p_response text,
  p_response_note text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_quote record;
  v_enquiry record;
  v_now timestamptz := clock_timestamp();
  v_target_stage text;
  v_message text;
BEGIN
  IF p_response NOT IN ('accepted', 'declined') THEN
    RAISE EXCEPTION 'Invalid quote response.' USING ERRCODE = '22023';
  END IF;

  SELECT id, business_id, customer_id, enquiry_id, quote_number, status, expiry_date
    INTO v_quote
    FROM public.quotes
   WHERE id = p_quote_id
     AND user_id = p_user_id
   FOR UPDATE;

  IF NOT FOUND OR v_quote.status <> 'sent' THEN
    RAISE EXCEPTION 'Quote is no longer available for a response.' USING ERRCODE = 'P0001';
  END IF;

  IF v_quote.expiry_date IS NOT NULL
     AND v_quote.expiry_date < (v_now AT TIME ZONE 'Australia/Sydney')::date THEN
    UPDATE public.quotes SET status = 'expired', updated_at = v_now WHERE id = v_quote.id;
    INSERT INTO public.audit_events
      (business_id, actor_user_id, action, entity_type, entity_id, details)
    VALUES
      (v_quote.business_id, p_user_id, 'quote.expired', 'quote', v_quote.id,
       jsonb_build_object('quote_number',v_quote.quote_number,'expiry_date',v_quote.expiry_date));
    RETURN jsonb_build_object('success',false,'expired',true,'quote_id',v_quote.id);
  END IF;

  UPDATE public.quotes
     SET status = p_response,
         response_at = v_now,
         response_note = NULLIF(left(trim(coalesce(p_response_note, '')), 1000), ''),
         updated_at = v_now
   WHERE id = v_quote.id;

  IF v_quote.enquiry_id IS NOT NULL THEN
    SELECT id, stage, request_type, archived_at
      INTO v_enquiry
      FROM public.enquiries
     WHERE id = v_quote.enquiry_id
       AND business_id = v_quote.business_id
     FOR UPDATE;

    IF NOT FOUND OR v_enquiry.request_type <> 'quote_request' OR v_enquiry.archived_at IS NOT NULL THEN
      RAISE EXCEPTION 'This quote is not attached to an active Quote Request Jobcard.' USING ERRCODE = 'P0001';
    END IF;

    v_target_stage := CASE WHEN p_response = 'declined' THEN 'closed' ELSE 'approved' END;

      UPDATE public.enquiries
         SET stage = v_target_stage,
             status = CASE WHEN p_response = 'declined' THEN 'closed' ELSE 'accepted' END,
             archived_at = CASE WHEN p_response = 'declined' THEN v_now ELSE archived_at END,
             guest_access_token_hash = CASE WHEN p_response = 'declined' THEN NULL ELSE guest_access_token_hash END,
             guest_access_expires_at = CASE WHEN p_response = 'declined' THEN v_now ELSE guest_access_expires_at END,
             updated_at = v_now
       WHERE id = v_enquiry.id
         AND business_id = v_quote.business_id;

      IF v_enquiry.stage IS DISTINCT FROM v_target_stage THEN
        INSERT INTO public.enquiry_stage_history
          (business_id, enquiry_id, from_stage, to_stage, changed_by, note)
        VALUES
          (v_quote.business_id, v_enquiry.id, v_enquiry.stage, v_target_stage, p_user_id,
           CASE WHEN p_response = 'declined'
             THEN 'Customer declined quote ' || v_quote.quote_number || '; Jobcard closed, archived and guest access revoked.'
             ELSE 'Customer accepted quote ' || v_quote.quote_number || '; Jobcard moved to booking coordination.'
           END);
      END IF;
  END IF;

  v_message := CASE WHEN p_response = 'declined'
    THEN 'Quote ' || v_quote.quote_number || ' was declined by the customer. The request has been closed and archived.'
    ELSE 'Quote ' || v_quote.quote_number || ' was accepted by the customer.'
  END;
  IF NULLIF(trim(coalesce(p_response_note, '')), '') IS NOT NULL THEN
    v_message := v_message || ' Customer note: ' || left(trim(p_response_note), 1000);
  END IF;

  INSERT INTO public.customer_messages
    (business_id, customer_id, user_id, enquiry_id, quote_id, sender_type, sender_user_id, message, is_internal)
  VALUES
    (v_quote.business_id, v_quote.customer_id, p_user_id, v_quote.enquiry_id, v_quote.id, 'customer', p_user_id, v_message, false);

  INSERT INTO public.audit_events
    (business_id, actor_user_id, action, entity_type, entity_id, details)
  VALUES
    (v_quote.business_id, p_user_id,
     CASE WHEN p_response = 'declined' THEN 'quote.declined_and_request_archived' ELSE 'quote.accepted' END,
     'quote', v_quote.id,
     jsonb_build_object('quote_number', v_quote.quote_number, 'response_at', v_now,
       'response_note', NULLIF(left(trim(coalesce(p_response_note, '')), 1000), ''),
       'enquiry_id', v_quote.enquiry_id, 'request_closed', p_response = 'declined'));

  RETURN jsonb_build_object('success', true, 'response', p_response,
    'quote_id', v_quote.id, 'enquiry_id', v_quote.enquiry_id,
    'request_archived', p_response = 'declined', 'response_at', v_now);
END;
$$;

REVOKE ALL ON FUNCTION public.respond_to_customer_quote(uuid, uuid, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.respond_to_customer_quote(uuid, uuid, text, text) TO service_role;

CREATE OR REPLACE FUNCTION public.respond_to_guest_quote(
  p_ticket_id uuid,
  p_quote_id uuid,
  p_guest_token_hash text,
  p_response text,
  p_response_note text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_enquiry record;
  v_quote record;
  v_now timestamptz := clock_timestamp();
  v_target_stage text;
  v_message text;
BEGIN
  IF p_response NOT IN ('accepted', 'declined') THEN
    RAISE EXCEPTION 'Invalid quote response.' USING ERRCODE = '22023';
  END IF;

  SELECT id, business_id, contact_name, email, stage
    INTO v_enquiry
    FROM public.enquiries
   WHERE id = p_ticket_id
     AND request_type = 'quote_request'
     AND guest_access_token_hash = p_guest_token_hash
     AND guest_access_expires_at > v_now
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Guest request access is no longer available.' USING ERRCODE = 'P0001';
  END IF;

  SELECT id, business_id, enquiry_id, quote_number, status, expiry_date
    INTO v_quote
    FROM public.quotes
   WHERE id = p_quote_id
     AND business_id = v_enquiry.business_id
     AND enquiry_id = v_enquiry.id
   FOR UPDATE;

  IF NOT FOUND OR v_quote.status <> 'sent' THEN
    RAISE EXCEPTION 'Quote is no longer available for a response.' USING ERRCODE = 'P0001';
  END IF;

  IF v_quote.expiry_date IS NOT NULL
     AND v_quote.expiry_date < (v_now AT TIME ZONE 'Australia/Sydney')::date THEN
    UPDATE public.quotes SET status = 'expired', updated_at = v_now WHERE id = v_quote.id;
    INSERT INTO public.audit_events
      (business_id, actor_user_id, action, entity_type, entity_id, details)
    VALUES
      (v_quote.business_id, NULL, 'guest_quote.expired', 'quote', v_quote.id,
       jsonb_build_object('quote_number',v_quote.quote_number,'expiry_date',v_quote.expiry_date));
    RETURN jsonb_build_object('success',false,'expired',true,'quote_id',v_quote.id);
  END IF;

  UPDATE public.quotes
     SET status = p_response,
         response_at = v_now,
         response_note = NULLIF(left(trim(coalesce(p_response_note, '')), 1000), ''),
         updated_at = v_now
   WHERE id = v_quote.id;

  v_target_stage := CASE WHEN p_response = 'declined' THEN 'closed' ELSE 'approved' END;

  UPDATE public.enquiries
     SET stage = v_target_stage,
         status = CASE WHEN p_response = 'declined' THEN 'closed' ELSE 'accepted' END,
         archived_at = CASE WHEN p_response = 'declined' THEN v_now ELSE archived_at END,
         guest_access_token_hash = CASE WHEN p_response = 'declined' THEN NULL ELSE guest_access_token_hash END,
         guest_access_expires_at = CASE WHEN p_response = 'declined' THEN v_now ELSE guest_access_expires_at END,
         updated_at = v_now
   WHERE id = v_enquiry.id
     AND business_id = v_enquiry.business_id;

  IF v_enquiry.stage IS DISTINCT FROM v_target_stage THEN
    INSERT INTO public.enquiry_stage_history
      (business_id, enquiry_id, from_stage, to_stage, changed_by, note)
    VALUES
      (v_enquiry.business_id, v_enquiry.id, v_enquiry.stage, v_target_stage, NULL,
       CASE WHEN p_response = 'declined'
         THEN 'Guest customer declined quote ' || v_quote.quote_number || '; Jobcard closed, archived and guest access revoked.'
         ELSE 'Guest customer accepted quote ' || v_quote.quote_number || '; Jobcard moved to booking coordination.'
       END);
  END IF;

  v_message := CASE WHEN p_response = 'declined'
    THEN 'Quote ' || v_quote.quote_number || ' was declined by the customer. The request has been closed and archived.'
    ELSE 'Quote ' || v_quote.quote_number || ' was accepted by the customer.'
  END;
  IF NULLIF(trim(coalesce(p_response_note, '')), '') IS NOT NULL THEN
    v_message := v_message || ' Customer note: ' || left(trim(p_response_note), 1000);
  END IF;

  INSERT INTO public.customer_messages
    (business_id, customer_id, user_id, enquiry_id, quote_id, sender_type, sender_user_id, guest_name, guest_email, message, is_internal)
  VALUES
    (v_enquiry.business_id, NULL, NULL, v_enquiry.id, v_quote.id, 'customer', NULL,
     v_enquiry.contact_name, v_enquiry.email, v_message, false);

  INSERT INTO public.audit_events
    (business_id, actor_user_id, action, entity_type, entity_id, details)
  VALUES
    (v_enquiry.business_id, NULL,
     CASE WHEN p_response = 'declined' THEN 'guest_quote.declined_and_request_archived' ELSE 'guest_quote.accepted' END,
     'quote', v_quote.id,
     jsonb_build_object('quote_number', v_quote.quote_number, 'response_at', v_now,
       'response_note', NULLIF(left(trim(coalesce(p_response_note, '')), 1000), ''),
       'request_id', v_enquiry.id, 'request_closed', p_response = 'declined'));

  RETURN jsonb_build_object('success', true, 'response', p_response,
    'quote_id', v_quote.id, 'enquiry_id', v_enquiry.id,
    'request_archived', p_response = 'declined', 'response_at', v_now);
END;
$$;

REVOKE ALL ON FUNCTION public.respond_to_guest_quote(uuid, uuid, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.respond_to_guest_quote(uuid, uuid, text, text, text) TO service_role;
