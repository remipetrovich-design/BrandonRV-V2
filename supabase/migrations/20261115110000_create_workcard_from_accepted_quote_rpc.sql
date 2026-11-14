-- Create a Workcard from an accepted quote as one atomic database transaction.
-- The quote row is locked to make retries/concurrent requests idempotent.
CREATE OR REPLACE FUNCTION public.create_workcard_from_accepted_quote(
  p_business_id uuid,
  p_quote_id uuid,
  p_actor_user_id uuid,
  p_job_number text,
  p_title text DEFAULT NULL,
  p_scope text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_quote record;
  v_enquiry record;
  v_booking record;
  v_existing record;
  v_job record;
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_line_count integer;
  v_has_parts boolean;
  v_booking_confirmed boolean;
  v_target_stage text;
  v_target_status text;
  v_title text;
  v_scope text;
  v_default_scope text;
BEGIN
  IF p_business_id IS NULL OR p_quote_id IS NULL OR p_actor_user_id IS NULL
     OR length(trim(coalesce(p_job_number, ''))) < 5
     OR length(trim(coalesce(p_job_number, ''))) > 50 THEN
    RAISE EXCEPTION 'Invalid Workcard conversion details.' USING ERRCODE = '22023';
  END IF;

  SELECT q.id, q.business_id, q.customer_id, q.user_id, q.enquiry_id,
         q.quote_number, q.status, q.quote_kind
    INTO v_quote
    FROM public.quotes q
   WHERE q.id = p_quote_id
     AND q.business_id = p_business_id
   FOR UPDATE;

  IF NOT FOUND OR v_quote.status <> 'accepted' OR v_quote.quote_kind <> 'standard'
     OR v_quote.enquiry_id IS NULL THEN
    RAISE EXCEPTION 'Only a customer-accepted standard quote linked to an active Jobcard can create a Workcard.'
      USING ERRCODE = 'P0001';
  END IF;

  SELECT e.id, e.business_id, e.customer_id, e.user_id, e.contact_name, e.email,
         e.description, e.request_type, e.stage, e.status, e.archived_at
    INTO v_enquiry
    FROM public.enquiries e
   WHERE e.id = v_quote.enquiry_id
     AND e.business_id = p_business_id
   FOR UPDATE;

  IF NOT FOUND OR v_enquiry.request_type <> 'quote_request'
     OR v_enquiry.archived_at IS NOT NULL
     OR v_enquiry.status IN ('declined', 'closed') THEN
    RAISE EXCEPTION 'The linked customer Jobcard is no longer active.'
      USING ERRCODE = 'P0001';
  END IF;

  SELECT j.id, j.job_number, j.title, j.status, j.senior_approval_status, j.quote_id
    INTO v_existing
    FROM public.jobs j
   WHERE j.business_id = p_business_id
     AND j.quote_id = p_quote_id
   LIMIT 1;

  IF FOUND THEN
    RETURN pg_catalog.jsonb_build_object(
      'job', pg_catalog.jsonb_build_object(
        'id', v_existing.id,
        'job_number', v_existing.job_number,
        'title', v_existing.title,
        'status', v_existing.status,
        'senior_approval_status', v_existing.senior_approval_status,
        'quote_id', v_existing.quote_id
      ),
      'alreadyCreated', true
    );
  END IF;

  SELECT a.id, a.status, a.starts_at, a.ends_at
    INTO v_booking
    FROM public.appointments a
   WHERE a.business_id = p_business_id
     AND a.quote_id = p_quote_id
     AND a.status IN ('requested', 'confirmed', 'rescheduled')
   ORDER BY a.created_at DESC
   LIMIT 1
   FOR UPDATE;

  SELECT count(*)::integer,
         coalesce(bool_or(qi.item_type = 'parts'), false),
         pg_catalog.string_agg(trim(qi.description), E'\n' ORDER BY qi.sort_order, qi.id)
    INTO v_line_count, v_has_parts, v_default_scope
    FROM public.quote_items qi
   WHERE qi.quote_id = p_quote_id;

  IF v_line_count < 1 THEN
    RAISE EXCEPTION 'An accepted quote must contain at least one line before a Workcard can be created.'
      USING ERRCODE = '22023';
  END IF;

  IF EXISTS (
    SELECT 1
      FROM public.quote_items qi
     WHERE qi.quote_id = p_quote_id
       AND (
         qi.item_type NOT IN ('labour', 'parts')
         OR length(trim(qi.description)) < 3
         OR qi.quantity <= 0 OR qi.quantity > 10000
         OR qi.unit_price < 0
         OR qi.tax_rate < 0 OR qi.tax_rate > 100
       )
  ) THEN
    RAISE EXCEPTION 'Accepted quote lines are not valid Workcard entries.'
      USING ERRCODE = '22023';
  END IF;

  v_title := coalesce(
    nullif(left(trim(coalesce(p_title, '')), 180), ''),
    'Work for ' || v_quote.quote_number
  );
  v_scope := coalesce(
    nullif(left(trim(coalesce(p_scope, '')), 5000), ''),
    nullif(left(trim(coalesce(v_default_scope, '')), 5000), ''),
    left(trim(coalesce(v_enquiry.description, '')), 5000)
  );

  IF length(v_title) < 3 OR length(coalesce(v_scope, '')) < 3 THEN
    RAISE EXCEPTION 'A Workcard title and approved scope of work are required.'
      USING ERRCODE = '22023';
  END IF;

  v_booking_confirmed := coalesce(v_booking.status IN ('confirmed', 'rescheduled'), false);
  v_target_status := CASE WHEN v_booking_confirmed THEN 'scheduled' ELSE 'pending' END;
  v_target_stage := CASE
    WHEN v_has_parts THEN 'parts_required'
    WHEN v_booking_confirmed THEN 'booked'
    WHEN v_booking.status = 'requested' THEN 'booking_requested'
    ELSE 'workcard_created'
  END;

  INSERT INTO public.jobs (
    business_id, customer_id, user_id, guest_name, guest_email,
    quote_id, appointment_id, scheduled_start, scheduled_end,
    job_number, title, scope_of_work, status,
    senior_approval_status, workcard_review_status, created_at, updated_at
  )
  VALUES (
    p_business_id, coalesce(v_quote.customer_id, v_enquiry.customer_id),
    coalesce(v_quote.user_id, v_enquiry.user_id),
    v_enquiry.contact_name, v_enquiry.email,
    p_quote_id, v_booking.id,
    CASE WHEN v_booking_confirmed THEN v_booking.starts_at ELSE NULL END,
    CASE WHEN v_booking_confirmed THEN v_booking.ends_at ELSE NULL END,
    trim(p_job_number), v_title, v_scope, v_target_status,
    'not_submitted', 'pending_review', v_now, v_now
  )
  RETURNING * INTO v_job;

  INSERT INTO public.job_work_entries (
    business_id, job_id, created_by, source_quote_item_id, entry_type,
    description, quantity, quantity_required, quantity_used,
    quantity_ordered, quantity_received, quantity_returned, part_order_status,
    unit_price, cost_unit_price, tax_rate, line_total, service_id,
    customer_visible, invoiceable
  )
  SELECT
    p_business_id, v_job.id, p_actor_user_id, qi.id, qi.item_type,
    trim(qi.description), qi.quantity, qi.quantity, 0,
    0, 0, 0,
    CASE WHEN qi.item_type = 'parts' THEN 'not_ordered' ELSE 'not_required' END,
    qi.unit_price, 0, qi.tax_rate, 0, qi.service_id,
    false, false
  FROM public.quote_items qi
  WHERE qi.quote_id = p_quote_id
  ORDER BY qi.sort_order, qi.id;

  UPDATE public.enquiries
     SET stage = v_target_stage,
         status = 'converted',
         updated_at = v_now
   WHERE id = v_enquiry.id
     AND business_id = p_business_id;

  IF v_enquiry.stage IS DISTINCT FROM v_target_stage THEN
    INSERT INTO public.enquiry_stage_history (
      business_id, enquiry_id, from_stage, to_stage, changed_by, note
    )
    VALUES (
      p_business_id, v_enquiry.id, v_enquiry.stage, v_target_stage, p_actor_user_id,
      'Accepted quote ' || v_quote.quote_number || ' converted into a prepared Workcard.'
    );
  END IF;

  INSERT INTO public.audit_events (
    business_id, actor_user_id, action, entity_type, entity_id, details
  )
  VALUES (
    p_business_id, p_actor_user_id, 'workcard.created_from_accepted_quote',
    'job', v_job.id,
    pg_catalog.jsonb_build_object(
      'quote_id', p_quote_id,
      'enquiry_id', v_enquiry.id,
      'review_status', 'pending_review',
      'prepared_entry_count', v_line_count
    )
  );

  RETURN pg_catalog.jsonb_build_object(
    'job', pg_catalog.jsonb_build_object(
      'id', v_job.id,
      'job_number', v_job.job_number,
      'title', v_job.title,
      'status', v_job.status,
      'senior_approval_status', v_job.senior_approval_status,
      'quote_id', v_job.quote_id
    ),
    'alreadyCreated', false
  );
END;
$$;

REVOKE ALL ON FUNCTION public.create_workcard_from_accepted_quote(uuid, uuid, uuid, text, text, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_workcard_from_accepted_quote(uuid, uuid, uuid, text, text, text)
  TO service_role;
