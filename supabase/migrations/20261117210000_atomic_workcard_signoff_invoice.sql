-- Start is a single locked transition after setup review, accepted assignment and confirmed booking.
CREATE OR REPLACE FUNCTION public.start_workcard(
  p_job_id uuid,
  p_business_id uuid,
  p_actor_user_id uuid,
  p_staff_id uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_job public.jobs%ROWTYPE;
  v_booking public.appointments%ROWTYPE;
  v_now timestamptz := clock_timestamp();
BEGIN
  SELECT * INTO v_job FROM public.jobs
   WHERE id=p_job_id AND business_id=p_business_id
   FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Workcard not found.' USING ERRCODE='P0001'; END IF;
  IF v_job.status='in_progress' THEN
    RETURN jsonb_build_object('success',true,'status','in_progress','already_started',true);
  END IF;
  IF v_job.status NOT IN ('pending','scheduled') THEN
    RAISE EXCEPTION 'This Workcard cannot be started from its current status.' USING ERRCODE='P0001';
  END IF;
  IF coalesce(v_job.workcard_review_status,'legacy_approved') NOT IN ('approved','legacy_approved') THEN
    RAISE EXCEPTION 'The Workcard must pass senior setup review before work can start.' USING ERRCODE='P0001';
  END IF;
  IF v_job.appointment_id IS NULL THEN
    RAISE EXCEPTION 'A confirmed booking is required before work can start.' USING ERRCODE='P0001';
  END IF;
  SELECT * INTO v_booking FROM public.appointments
   WHERE id=v_job.appointment_id AND business_id=p_business_id
   FOR UPDATE;
  IF NOT FOUND OR v_booking.status NOT IN ('confirmed','rescheduled') OR v_booking.starts_at IS NULL OR length(trim(coalesce(v_booking.location,'')))<3 THEN
    RAISE EXCEPTION 'A confirmed booking with a start time and customer-site location is required before work can start.' USING ERRCODE='P0001';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM public.job_assignments a WHERE a.business_id=p_business_id AND a.job_id=p_job_id AND a.staff_id=p_staff_id AND a.status='accepted') THEN
    RAISE EXCEPTION 'Accept this Workcard assignment before starting work.' USING ERRCODE='P0001';
  END IF;
  UPDATE public.jobs SET status='in_progress',actual_start=v_now,updated_at=v_now
   WHERE id=p_job_id AND business_id=p_business_id;
  INSERT INTO public.audit_events(business_id,actor_user_id,action,entity_type,entity_id,details)
  VALUES(p_business_id,p_actor_user_id,'work_order.started','job',p_job_id,jsonb_build_object('staff_id',p_staff_id,'started_at',v_now));
  RETURN jsonb_build_object('success',true,'status','in_progress','already_started',false);
END;
$$;

REVOKE ALL ON FUNCTION public.start_workcard(uuid,uuid,uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.start_workcard(uuid,uuid,uuid,uuid) TO service_role;

-- A Workcard sign-off invoice is a single, idempotent final invoice.
ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS workcard_signoff_invoice boolean NOT NULL DEFAULT false;

CREATE UNIQUE INDEX IF NOT EXISTS invoices_one_workcard_signoff_uidx
  ON public.invoices (job_id)
  WHERE job_id IS NOT NULL AND workcard_signoff_invoice = true;

CREATE OR REPLACE FUNCTION public.finish_workcard_and_create_invoice(
  p_job_id uuid,
  p_business_id uuid,
  p_actor_user_id uuid,
  p_staff_id uuid,
  p_work_summary text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_job public.jobs%ROWTYPE;
  v_booking public.appointments%ROWTYPE;
  v_invoice public.invoices%ROWTYPE;
  v_now timestamptz := clock_timestamp();
  v_summary text := left(trim(coalesce(p_work_summary,'')),8000);
  v_item_count integer := 0;
  v_subtotal numeric(12,2) := 0;
  v_tax_amount numeric(12,2) := 0;
BEGIN
  SELECT * INTO v_job
    FROM public.jobs
   WHERE id = p_job_id AND business_id = p_business_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Workcard not found.' USING ERRCODE = 'P0001';
  END IF;

  SELECT * INTO v_invoice
    FROM public.invoices
   WHERE job_id = p_job_id
     AND business_id = p_business_id
     AND workcard_signoff_invoice = true
   LIMIT 1;
  IF FOUND AND v_job.status = 'completed' AND v_job.worker_signed_off_at IS NOT NULL THEN
    RETURN jsonb_build_object('success',true,'already_finished',true,'invoice',to_jsonb(v_invoice));
  END IF;
  IF v_job.status <> 'in_progress' OR v_job.worker_signed_off_at IS NOT NULL THEN
    RAISE EXCEPTION 'Only an in-progress Workcard can be signed off.' USING ERRCODE = 'P0001';
  END IF;
  IF coalesce(v_job.workcard_review_status,'legacy_approved') NOT IN ('approved','legacy_approved') THEN
    RAISE EXCEPTION 'The Workcard must pass senior setup review before sign-off.' USING ERRCODE = 'P0001';
  END IF;
  IF length(v_summary) < 10 THEN
    RAISE EXCEPTION 'Add a useful summary of the work completed before signing off.' USING ERRCODE = '22023';
  END IF;
  IF v_job.appointment_id IS NULL THEN
    RAISE EXCEPTION 'A confirmed booking is required before Workcard sign-off.' USING ERRCODE = 'P0001';
  END IF;
  SELECT * INTO v_booking
    FROM public.appointments
   WHERE id = v_job.appointment_id
     AND business_id = p_business_id
   FOR UPDATE;
  IF NOT FOUND OR v_booking.status NOT IN ('confirmed','rescheduled') THEN
    RAISE EXCEPTION 'A confirmed booking is required before Workcard sign-off.' USING ERRCODE = 'P0001';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.job_assignments a
     WHERE a.business_id = p_business_id
       AND a.job_id = p_job_id
       AND a.staff_id = p_staff_id
       AND a.status = 'accepted'
  ) THEN
    RAISE EXCEPTION 'An accepted Workcard assignment is required before sign-off.' USING ERRCODE = 'P0001';
  END IF;

  SELECT count(*),
         coalesce(sum(round(e.quantity_used * e.unit_price,2)),0),
         coalesce(round(sum(round(e.quantity_used * e.unit_price,2) * e.tax_rate / 100),2),0)
    INTO v_item_count,v_subtotal,v_tax_amount
    FROM public.job_work_entries e
   WHERE e.business_id = p_business_id
     AND e.job_id = p_job_id
     AND e.entry_type IN ('labour','parts')
     AND e.invoiceable = true
     AND e.quantity_used > 0;
  IF v_item_count = 0 THEN
    RAISE EXCEPTION 'Record actual labour or parts used and mark at least one completed item as invoiceable before signing off this Workcard.' USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO public.invoices
    (business_id,customer_id,user_id,job_id,quote_id,invoice_number,status,
     subtotal,tax_amount,total,amount_paid,notes,workcard_signoff_invoice,created_at,updated_at)
  VALUES
    (p_business_id,v_job.customer_id,v_job.user_id,p_job_id,v_job.quote_id,
     'BRV-I-' || upper(substr(replace(gen_random_uuid()::text,'-',''),1,10)),
     'draft',v_subtotal,v_tax_amount,v_subtotal+v_tax_amount,0,
     'Final invoice for Workcard ' || v_job.job_number,true,v_now,v_now)
  RETURNING * INTO v_invoice;

  INSERT INTO public.invoice_items
    (invoice_id,description,quantity,unit_price,tax_rate,line_total,sort_order)
  SELECT v_invoice.id,e.description,e.quantity_used,e.unit_price,e.tax_rate,
         round(e.quantity_used*e.unit_price,2),
         row_number() OVER (ORDER BY e.occurred_at,e.id)-1
    FROM public.job_work_entries e
   WHERE e.business_id = p_business_id
     AND e.job_id = p_job_id
     AND e.entry_type IN ('labour','parts')
     AND e.invoiceable = true
     AND e.quantity_used > 0
   ORDER BY e.occurred_at,e.id;

  UPDATE public.jobs
     SET status = 'completed',
         completed_at = v_now,
         actual_end = v_now,
         work_summary = v_summary,
         worker_signed_off_by = p_actor_user_id,
         worker_signed_off_at = v_now,
         senior_approval_status = 'pending',
         senior_approved_by = NULL,
         senior_approved_at = NULL,
         senior_approval_note = NULL,
         customer_approval_status = 'not_ready',
         customer_approved_at = NULL,
         final_report_created_at = v_now,
         updated_at = v_now
   WHERE id = p_job_id AND business_id = p_business_id;

  UPDATE public.job_assignments
     SET status = 'completed'
   WHERE business_id = p_business_id
     AND job_id = p_job_id
     AND status = 'accepted';

  INSERT INTO public.audit_events
    (business_id,actor_user_id,action,entity_type,entity_id,details)
  VALUES
    (p_business_id,p_actor_user_id,'work_order.finished_report_created','job',p_job_id,
     jsonb_build_object('invoice_id',v_invoice.id,'invoice_number',v_invoice.invoice_number,
       'total',v_invoice.total,'entry_count',v_item_count));

  RETURN jsonb_build_object('success',true,'already_finished',false,'invoice',
    jsonb_build_object('id',v_invoice.id,'invoice_number',v_invoice.invoice_number,
      'total',v_invoice.total,'status',v_invoice.status));
END;
$$;

REVOKE ALL ON FUNCTION public.finish_workcard_and_create_invoice(uuid,uuid,uuid,uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.finish_workcard_and_create_invoice(uuid,uuid,uuid,uuid,text) TO service_role;
