-- Delete an untouched pending Workcard and record its audit event atomically.
CREATE OR REPLACE FUNCTION public.delete_untouched_workcard(
  p_business_id uuid,
  p_job_id uuid,
  p_actor_user_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_job record;
BEGIN
  IF p_business_id IS NULL OR p_job_id IS NULL OR p_actor_user_id IS NULL THEN
    RAISE EXCEPTION 'Invalid Workcard deletion details.' USING ERRCODE = '22023';
  END IF;

  SELECT j.id, j.job_number, j.status, j.worker_signed_off_at, j.customer_approval_status
    INTO v_job
    FROM public.jobs j
   WHERE j.id = p_job_id AND j.business_id = p_business_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Workcard not found.' USING ERRCODE = 'P0002';
  END IF;

  IF v_job.status <> 'pending'
     OR v_job.worker_signed_off_at IS NOT NULL
     OR v_job.customer_approval_status = 'approved' THEN
    RAISE EXCEPTION 'Only an untouched pending Workcard can be deleted. Cancel or complete active Workcards instead.'
      USING ERRCODE = 'P0001';
  END IF;

  IF EXISTS (SELECT 1 FROM public.invoices i WHERE i.business_id = p_business_id AND i.job_id = p_job_id)
     OR EXISTS (SELECT 1 FROM public.job_tasks t WHERE t.business_id = p_business_id AND t.job_id = p_job_id)
     OR EXISTS (SELECT 1 FROM public.job_assignments a WHERE a.business_id = p_business_id AND a.job_id = p_job_id)
     OR EXISTS (SELECT 1 FROM public.job_attachments a WHERE a.business_id = p_business_id AND a.job_id = p_job_id)
     OR EXISTS (SELECT 1 FROM public.supplier_orders s WHERE s.business_id = p_business_id AND s.job_id = p_job_id)
     OR EXISTS (SELECT 1 FROM public.expenses e WHERE e.business_id = p_business_id AND e.job_id = p_job_id)
     OR EXISTS (SELECT 1 FROM public.time_entries t WHERE t.business_id = p_business_id AND t.job_id = p_job_id)
     OR EXISTS (
       SELECT 1 FROM public.job_work_entries w
        WHERE w.business_id = p_business_id AND w.job_id = p_job_id
          AND (w.quantity_used > 0 OR w.quantity_ordered > 0 OR w.quantity_received > 0
               OR w.quantity_returned > 0 OR w.invoiceable)
     ) THEN
    RAISE EXCEPTION 'This Workcard has linked operational or financial activity. Cancel it instead of deleting it.'
      USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO public.audit_events (
    business_id, actor_user_id, action, entity_type, entity_id, details
  ) VALUES (
    p_business_id, p_actor_user_id, 'workcard.deleted', 'job', p_job_id,
    pg_catalog.jsonb_build_object('job_number', v_job.job_number)
  );

  DELETE FROM public.jobs
   WHERE id = p_job_id AND business_id = p_business_id;

  RETURN pg_catalog.jsonb_build_object('success', true);
END;
$$;

REVOKE ALL ON FUNCTION public.delete_untouched_workcard(uuid, uuid, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.delete_untouched_workcard(uuid, uuid, uuid)
  TO service_role;
