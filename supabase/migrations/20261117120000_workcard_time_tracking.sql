-- Link staff time tracking to Workcard labour and make approval update actual hours atomically.
ALTER TABLE public.time_entries
  ADD COLUMN IF NOT EXISTS work_entry_id uuid REFERENCES public.job_work_entries(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS time_entries_work_entry_approval_idx
  ON public.time_entries(work_entry_id,approved_at,started_at)
  WHERE work_entry_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS time_entries_one_open_per_staff_idx
  ON public.time_entries(business_id,staff_id)
  WHERE ended_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS attendance_entries_one_open_per_user_idx
  ON public.attendance_entries(business_id,user_id)
  WHERE clock_out IS NULL;

CREATE OR REPLACE FUNCTION public.approve_work_time_entry(
  p_business_id uuid,
  p_time_entry_id uuid,
  p_actor_user_id uuid,
  p_approved boolean
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_time record;
  v_job record;
  v_work_entry record;
  v_hours numeric(12,2);
  v_job_hours numeric(12,2);
  v_now timestamptz := pg_catalog.clock_timestamp();
BEGIN
  IF p_approved IS NULL THEN
    RAISE EXCEPTION 'Choose approve or revoke approval.' USING ERRCODE = '22023';
  END IF;

  SELECT id,business_id,job_id,work_entry_id,entry_type,started_at,ended_at,duration_minutes,approved_at
    INTO v_time
    FROM public.time_entries
   WHERE id = p_time_entry_id
     AND business_id = p_business_id
   FOR UPDATE;
  IF NOT FOUND OR v_time.ended_at IS NULL OR v_time.duration_minutes IS NULL OR v_time.duration_minutes <= 0 THEN
    RAISE EXCEPTION 'Only a completed time entry can be approved.' USING ERRCODE = 'P0001';
  END IF;

  IF v_time.job_id IS NOT NULL THEN
    SELECT id,status,worker_signed_off_at
      INTO v_job
      FROM public.jobs
     WHERE id = v_time.job_id AND business_id = p_business_id
     FOR UPDATE;
    IF NOT FOUND OR v_job.status IN ('completed','cancelled') OR v_job.worker_signed_off_at IS NOT NULL THEN
      RAISE EXCEPTION 'Time for a closed Workcard cannot change its approved actual hours.' USING ERRCODE = 'P0001';
    END IF;
  END IF;

  UPDATE public.time_entries
     SET approved_at = CASE WHEN p_approved THEN v_now ELSE NULL END,
         approved_by = CASE WHEN p_approved THEN p_actor_user_id ELSE NULL END
   WHERE id = p_time_entry_id
     AND business_id = p_business_id;

  IF v_time.work_entry_id IS NOT NULL THEN
    SELECT id,job_id,entry_type,unit_price
      INTO v_work_entry
      FROM public.job_work_entries
     WHERE id = v_time.work_entry_id
       AND business_id = p_business_id
       AND job_id = v_time.job_id
     FOR UPDATE;
    IF NOT FOUND OR v_work_entry.entry_type <> 'labour' THEN
      RAISE EXCEPTION 'The linked Workcard labour entry is no longer available.' USING ERRCODE = 'P0001';
    END IF;

    SELECT pg_catalog.round(coalesce(sum(duration_minutes),0)::numeric / 60,2)
      INTO v_hours
      FROM public.time_entries
     WHERE work_entry_id = v_time.work_entry_id
       AND business_id = p_business_id
       AND entry_type = 'work'
       AND ended_at IS NOT NULL
       AND approved_at IS NOT NULL;

    UPDATE public.job_work_entries
       SET quantity_used = v_hours,
           line_total = pg_catalog.round(v_hours * v_work_entry.unit_price,2)
     WHERE id = v_time.work_entry_id
       AND business_id = p_business_id;
  END IF;

  IF v_time.job_id IS NOT NULL THEN
    SELECT pg_catalog.round(coalesce(sum(duration_minutes),0)::numeric / 60,2)
      INTO v_job_hours
      FROM public.time_entries
     WHERE job_id = v_time.job_id
       AND business_id = p_business_id
       AND entry_type = 'work'
       AND ended_at IS NOT NULL
       AND approved_at IS NOT NULL;

    UPDATE public.jobs
       SET actual_hours = v_job_hours,
           updated_at = v_now
     WHERE id = v_time.job_id
       AND business_id = p_business_id;
  END IF;

  INSERT INTO public.audit_events
    (business_id,actor_user_id,action,entity_type,entity_id,details)
  VALUES
    (p_business_id,p_actor_user_id,
     CASE WHEN p_approved THEN 'work_time.approved' ELSE 'work_time.approval_revoked' END,
     'time_entry',p_time_entry_id,
     pg_catalog.jsonb_build_object('job_id',v_time.job_id,'work_entry_id',v_time.work_entry_id,
       'duration_minutes',v_time.duration_minutes));

  RETURN pg_catalog.jsonb_build_object('success',true,'approved',p_approved,
    'job_id',v_time.job_id,'work_entry_id',v_time.work_entry_id);
END;
$$;

REVOKE ALL ON FUNCTION public.approve_work_time_entry(uuid,uuid,uuid,boolean) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.approve_work_time_entry(uuid,uuid,uuid,boolean) TO service_role;
