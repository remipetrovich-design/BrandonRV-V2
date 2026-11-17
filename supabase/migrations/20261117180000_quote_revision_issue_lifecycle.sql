-- Keep an already-issued quote active until its replacement revision is approved and issued.
-- The revision transition and superseding of the prior issued revision occur atomically.
CREATE UNIQUE INDEX IF NOT EXISTS quotes_enquiry_standard_revision_uidx
  ON public.quotes (business_id, enquiry_id, revision_number)
  WHERE enquiry_id IS NOT NULL AND quote_kind = 'standard';

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

  -- Keep the currently issued revision valid while a replacement is only a draft.
  -- Supersede earlier issued revisions atomically with issuing the new approved revision.
  UPDATE public.quotes
     SET status = 'superseded',
         updated_at = v_now
   WHERE business_id = p_business_id
     AND enquiry_id = v_enquiry.id
     AND quote_kind = 'standard'
     AND status = 'sent'
     AND id <> v_quote.id
     AND revision_number < v_quote.revision_number;

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
