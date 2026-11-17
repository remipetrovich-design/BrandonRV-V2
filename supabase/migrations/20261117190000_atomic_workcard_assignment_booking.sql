-- Serialize team changes against the Workcard row and keep assignment replacement atomic.
CREATE UNIQUE INDEX IF NOT EXISTS job_assignments_job_staff_uidx
  ON public.job_assignments (job_id, staff_id);

-- Only one active booking request/confirmation can exist for a quote at a time.
CREATE UNIQUE INDEX IF NOT EXISTS appointments_one_open_booking_per_quote_uidx
  ON public.appointments (business_id, quote_id)
  WHERE quote_id IS NOT NULL AND status IN ('requested','confirmed','rescheduled');

CREATE OR REPLACE FUNCTION public.replace_workcard_assignments(
  p_job_id uuid,
  p_business_id uuid,
  p_actor_user_id uuid,
  p_staff_ids uuid[]
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_job public.jobs%ROWTYPE;
  v_staff_ids uuid[] := coalesce(p_staff_ids, ARRAY[]::uuid[]);
  v_now timestamptz := clock_timestamp();
  v_assigned integer := 0;
BEGIN
  IF cardinality(v_staff_ids) > 20
     OR cardinality(v_staff_ids) <> (SELECT count(DISTINCT selected.staff_id) FROM unnest(v_staff_ids) AS selected(staff_id)) THEN
    RAISE EXCEPTION 'Invalid staff selection.' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_job
    FROM public.jobs
   WHERE id = p_job_id AND business_id = p_business_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Workcard not found.' USING ERRCODE = 'P0001';
  END IF;
  IF v_job.status NOT IN ('pending','scheduled')
     OR v_job.worker_signed_off_at IS NOT NULL THEN
    RAISE EXCEPTION 'Team assignments cannot change after workshop work has started or the Workcard has closed.' USING ERRCODE = 'P0001';
  END IF;
  IF coalesce(v_job.workcard_review_status,'legacy_approved') NOT IN ('approved','legacy_approved') THEN
    RAISE EXCEPTION 'The Workcard must pass senior setup review before it can be assigned.' USING ERRCODE = 'P0001';
  END IF;

  IF cardinality(v_staff_ids) > 0 AND EXISTS (
    SELECT 1
      FROM unnest(v_staff_ids) selected(staff_id)
      LEFT JOIN public.staff s
        ON s.id = selected.staff_id
       AND s.business_id = p_business_id
       AND s.employment_status = 'active'
     WHERE s.id IS NULL
  ) THEN
    RAISE EXCEPTION 'One or more staff members are not active in this business.' USING ERRCODE = '22023';
  END IF;

  UPDATE public.job_assignments
     SET status = 'removed'
   WHERE business_id = p_business_id
     AND job_id = p_job_id
     AND status <> 'removed'
     AND NOT (staff_id = ANY(v_staff_ids));

  UPDATE public.job_assignments
     SET status = 'assigned',
         assigned_by = p_actor_user_id,
         assigned_at = v_now
   WHERE business_id = p_business_id
     AND job_id = p_job_id
     AND staff_id = ANY(v_staff_ids)
     AND status IN ('removed','declined');

  INSERT INTO public.job_assignments
    (business_id, job_id, staff_id, assigned_by, status, assigned_at)
  SELECT p_business_id, p_job_id, selected.staff_id, p_actor_user_id, 'assigned', v_now
    FROM unnest(v_staff_ids) selected(staff_id)
   WHERE NOT EXISTS (
     SELECT 1 FROM public.job_assignments existing
      WHERE existing.business_id = p_business_id
        AND existing.job_id = p_job_id
        AND existing.staff_id = selected.staff_id
   );

  SELECT count(*) INTO v_assigned
    FROM public.job_assignments
   WHERE business_id = p_business_id
     AND job_id = p_job_id
     AND status IN ('assigned','accepted');

  INSERT INTO public.audit_events
    (business_id, actor_user_id, action, entity_type, entity_id, details)
  VALUES
    (p_business_id, p_actor_user_id, 'job.staff_assigned', 'job', p_job_id,
     jsonb_build_object('staff_ids', to_jsonb(v_staff_ids), 'assigned_count', v_assigned));

  RETURN jsonb_build_object('success', true, 'assigned_count', v_assigned);
END;
$$;

REVOKE ALL ON FUNCTION public.replace_workcard_assignments(uuid,uuid,uuid,uuid[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.replace_workcard_assignments(uuid,uuid,uuid,uuid[]) TO service_role;
