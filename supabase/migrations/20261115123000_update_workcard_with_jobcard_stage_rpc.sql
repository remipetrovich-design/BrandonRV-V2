-- Apply Workcard field changes, Jobcard pipeline movement, stage history and audit as one transaction.
-- The service-role-only function is called by the authorised admin API after its request validation.
CREATE OR REPLACE FUNCTION public.update_workcard_with_jobcard_stage(
  p_business_id uuid,
  p_job_id uuid,
  p_actor_user_id uuid,
  p_patch jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_current public.jobs%ROWTYPE;
  v_updated public.jobs%ROWTYPE;
  v_quote record;
  v_enquiry record;
  v_next_stage text;
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_key text;
BEGIN
  IF p_business_id IS NULL OR p_job_id IS NULL OR p_actor_user_id IS NULL
     OR p_patch IS NULL OR pg_catalog.jsonb_typeof(p_patch) <> 'object'
     OR p_patch = '{}'::jsonb THEN
    RAISE EXCEPTION 'Invalid Workcard update details.' USING ERRCODE = '22023';
  END IF;

  FOR v_key IN SELECT pg_catalog.jsonb_object_keys(p_patch)
  LOOP
    IF v_key NOT IN (
      'title', 'scope_of_work', 'customer_visible_notes', 'internal_notes',
      'priority', 'estimated_hours', 'scheduled_start', 'scheduled_end', 'status'
    ) THEN
      RAISE EXCEPTION 'Unsupported Workcard update field: %', v_key USING ERRCODE = '22023';
    END IF;
  END LOOP;

  SELECT * INTO v_current
    FROM public.jobs
   WHERE id = p_job_id AND business_id = p_business_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Workcard not found.' USING ERRCODE = 'P0002';
  END IF;

  SELECT * INTO v_updated
    FROM pg_catalog.jsonb_populate_record(v_current, p_patch);

  IF p_patch ? 'status' THEN
    IF v_updated.status NOT IN ('pending', 'scheduled', 'in_progress', 'waiting_parts', 'completed', 'cancelled') THEN
      RAISE EXCEPTION 'Invalid Workcard status.' USING ERRCODE = '22023';
    END IF;

    IF NOT CASE v_current.status
      WHEN 'pending' THEN v_updated.status IN ('pending', 'scheduled', 'waiting_parts', 'in_progress', 'cancelled')
      WHEN 'scheduled' THEN v_updated.status IN ('scheduled', 'waiting_parts', 'in_progress', 'cancelled')
      WHEN 'waiting_parts' THEN v_updated.status IN ('waiting_parts', 'scheduled', 'in_progress', 'cancelled')
      WHEN 'in_progress' THEN v_updated.status IN ('in_progress', 'waiting_parts', 'completed', 'cancelled')
      WHEN 'completed' THEN v_updated.status = 'completed'
      WHEN 'cancelled' THEN v_updated.status = 'cancelled'
      ELSE false
    END THEN
      RAISE EXCEPTION 'This Workcard status transition is not permitted.' USING ERRCODE = 'P0001';
    END IF;

    IF v_updated.status = 'completed'
       AND v_current.senior_approval_status NOT IN ('approved', 'legacy_approved') THEN
      RAISE EXCEPTION 'Senior approval is required before completing a Workcard.' USING ERRCODE = 'P0001';
    END IF;

    IF v_updated.status = 'completed'
       AND v_current.customer_approval_status <> 'approved' THEN
      RAISE EXCEPTION 'Customer approval is required before completing a Workcard.' USING ERRCODE = 'P0001';
    END IF;
  END IF;

  IF p_patch ? 'scope_of_work'
     AND v_current.worker_signed_off_at IS NOT NULL
     AND v_updated.scope_of_work IS DISTINCT FROM v_current.scope_of_work THEN
    RAISE EXCEPTION 'A signed-off Workcard cannot have its approved scope overwritten. Record a variation instead.'
      USING ERRCODE = 'P0001';
  END IF;

  IF pg_catalog.length(pg_catalog.btrim(v_updated.title)) < 3
     OR pg_catalog.length(v_updated.title) > 180
     OR (p_patch ? 'scope_of_work' AND (
       pg_catalog.length(pg_catalog.btrim(v_updated.scope_of_work)) < 3
       OR pg_catalog.length(v_updated.scope_of_work) > 5000
     ))
     OR v_updated.priority NOT IN ('low', 'normal', 'high', 'urgent')
     OR (v_updated.estimated_hours IS NOT NULL AND (v_updated.estimated_hours < 0 OR v_updated.estimated_hours > 1000))
     OR (v_updated.scheduled_start IS NOT NULL AND v_updated.scheduled_end IS NOT NULL AND v_updated.scheduled_end <= v_updated.scheduled_start) THEN
    RAISE EXCEPTION 'Workcard update values are invalid.' USING ERRCODE = '22023';
  END IF;

  UPDATE public.jobs
     SET title = v_updated.title,
         scope_of_work = v_updated.scope_of_work,
         customer_visible_notes = v_updated.customer_visible_notes,
         internal_notes = v_updated.internal_notes,
         priority = v_updated.priority,
         estimated_hours = v_updated.estimated_hours,
         scheduled_start = v_updated.scheduled_start,
         scheduled_end = v_updated.scheduled_end,
         status = v_updated.status,
         updated_at = v_now
   WHERE id = p_job_id AND business_id = p_business_id
   RETURNING * INTO v_updated;

  IF p_patch ? 'status' AND v_updated.quote_id IS NOT NULL THEN
    v_next_stage := CASE v_updated.status
      WHEN 'waiting_parts' THEN 'parts_required'
      WHEN 'scheduled' THEN 'booked'
      WHEN 'in_progress' THEN 'work_in_progress'
      WHEN 'completed' THEN 'quality_check'
      WHEN 'cancelled' THEN 'cancelled'
      ELSE NULL
    END;

    IF v_next_stage IS NOT NULL THEN
      SELECT q.enquiry_id INTO v_quote
        FROM public.quotes q
       WHERE q.id = v_updated.quote_id AND q.business_id = p_business_id;

      IF v_quote.enquiry_id IS NOT NULL THEN
        SELECT e.id, e.stage INTO v_enquiry
          FROM public.enquiries e
         WHERE e.id = v_quote.enquiry_id AND e.business_id = p_business_id
         FOR UPDATE;

        IF FOUND AND v_enquiry.stage IS DISTINCT FROM v_next_stage THEN
          UPDATE public.enquiries
             SET stage = v_next_stage,
                 status = CASE WHEN v_next_stage = 'cancelled' THEN 'closed' ELSE 'converted' END,
                 archived_at = CASE WHEN v_next_stage = 'cancelled' THEN v_now ELSE NULL END,
                 updated_at = v_now
           WHERE id = v_enquiry.id AND business_id = p_business_id;

          INSERT INTO public.enquiry_stage_history (
            business_id, enquiry_id, from_stage, to_stage, changed_by, note
          ) VALUES (
            p_business_id, v_enquiry.id, v_enquiry.stage, v_next_stage, p_actor_user_id,
            'Pipeline advanced from Workcard status: ' || pg_catalog.replace(v_updated.status, '_', ' ')
          );
        END IF;
      END IF;
    END IF;
  END IF;

  INSERT INTO public.audit_events (
    business_id, actor_user_id, action, entity_type, entity_id, details
  ) VALUES (
    p_business_id, p_actor_user_id, 'workcard.updated', 'job', p_job_id,
    pg_catalog.jsonb_build_object('fields', pg_catalog.jsonb_object_keys(p_patch)::text[])
  );

  RETURN pg_catalog.jsonb_build_object(
    'job', pg_catalog.jsonb_build_object(
      'id', v_updated.id,
      'job_number', v_updated.job_number,
      'title', v_updated.title,
      'status', v_updated.status,
      'priority', v_updated.priority,
      'scheduled_start', v_updated.scheduled_start,
      'scheduled_end', v_updated.scheduled_end,
      'scope_of_work', v_updated.scope_of_work,
      'customer_visible_notes', v_updated.customer_visible_notes,
      'internal_notes', v_updated.internal_notes
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.update_workcard_with_jobcard_stage(uuid, uuid, uuid, jsonb)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.update_workcard_with_jobcard_stage(uuid, uuid, uuid, jsonb)
  TO service_role;
