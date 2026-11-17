-- Reconcile the Workcard / Jobcard lifecycle with the live Brandon RV identity and transaction model.
-- The app uses public.users, not auth.users, for staff and owner identity.
ALTER TABLE public.invoices DROP CONSTRAINT IF EXISTS invoices_issued_by_fkey;
ALTER TABLE public.invoices ADD CONSTRAINT invoices_issued_by_fkey
  FOREIGN KEY (issued_by) REFERENCES public.users(id) ON DELETE SET NULL;

-- Accepted workers cannot be silently removed when an administrator edits the team.
CREATE OR REPLACE FUNCTION public.replace_workcard_assignments(p_job_id uuid, p_business_id uuid, p_actor_user_id uuid, p_staff_ids uuid[])
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
     AND status IN ('assigned','declined')
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
$function$

REVOKE ALL ON FUNCTION public.replace_workcard_assignments(uuid,uuid,uuid,uuid[]) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.replace_workcard_assignments(uuid,uuid,uuid,uuid[]) TO service_role;

-- Workcard start, finish, setup review and senior review advance the original Jobcard
-- and record each real pipeline transition in the same transaction.
CREATE OR REPLACE FUNCTION public.start_workcard(p_job_id uuid, p_business_id uuid, p_actor_user_id uuid, p_staff_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_job public.jobs%ROWTYPE;
  v_booking public.appointments%ROWTYPE;
  v_now timestamptz := clock_timestamp();
  v_enquiry_id uuid;
  v_enquiry public.enquiries%ROWTYPE;
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
  IF v_job.quote_id IS NOT NULL THEN
    SELECT enquiry_id INTO v_enquiry_id FROM public.quotes WHERE id=v_job.quote_id AND business_id=p_business_id;
  END IF;
  IF v_enquiry_id IS NULL AND v_job.appointment_id IS NOT NULL THEN
    SELECT enquiry_id INTO v_enquiry_id FROM public.appointments WHERE id=v_job.appointment_id AND business_id=p_business_id;
  END IF;
  IF v_enquiry_id IS NOT NULL THEN
    SELECT * INTO v_enquiry FROM public.enquiries WHERE id=v_enquiry_id AND business_id=p_business_id FOR UPDATE;
    IF FOUND AND v_enquiry.request_type='quote_request' AND v_enquiry.archived_at IS NULL
       AND v_enquiry.stage IS DISTINCT FROM 'work_in_progress' THEN
      UPDATE public.enquiries SET stage='work_in_progress',status='converted',updated_at=v_now
       WHERE id=v_enquiry_id AND business_id=p_business_id;
      INSERT INTO public.enquiry_stage_history(business_id,enquiry_id,from_stage,to_stage,changed_by,note)
      VALUES(p_business_id,v_enquiry_id,v_enquiry.stage,'work_in_progress',p_actor_user_id,
        'Workcard ' || v_job.job_number || ' started by its assigned worker.');
    END IF;
  END IF;
  INSERT INTO public.audit_events(business_id,actor_user_id,action,entity_type,entity_id,details)
  VALUES(p_business_id,p_actor_user_id,'work_order.started','job',p_job_id,jsonb_build_object('staff_id',p_staff_id,'started_at',v_now));
  RETURN jsonb_build_object('success',true,'status','in_progress','already_started',false);
END;
$function$

REVOKE ALL ON FUNCTION public.start_workcard(uuid,uuid,uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.start_workcard(uuid,uuid,uuid,uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.finish_workcard_and_create_invoice(p_job_id uuid, p_business_id uuid, p_actor_user_id uuid, p_staff_id uuid, p_work_summary text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_job public.jobs%ROWTYPE;
  v_booking public.appointments%ROWTYPE;
  v_invoice public.invoices%ROWTYPE;
  v_now timestamptz := clock_timestamp();
  v_summary text := left(trim(coalesce(p_work_summary,'')),8000);
  v_item_count integer := 0;
  v_subtotal numeric(12,2) := 0;
  v_tax_amount numeric(12,2) := 0;
  v_enquiry_id uuid;
  v_enquiry public.enquiries%ROWTYPE;
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
  IF v_job.quote_id IS NOT NULL THEN
    SELECT enquiry_id INTO v_enquiry_id FROM public.quotes WHERE id=v_job.quote_id AND business_id=p_business_id;
  END IF;
  IF v_enquiry_id IS NULL AND v_job.appointment_id IS NOT NULL THEN
    SELECT enquiry_id INTO v_enquiry_id FROM public.appointments WHERE id=v_job.appointment_id AND business_id=p_business_id;
  END IF;
  IF v_enquiry_id IS NOT NULL THEN
    SELECT * INTO v_enquiry FROM public.enquiries WHERE id=v_enquiry_id AND business_id=p_business_id FOR UPDATE;
    IF FOUND AND v_enquiry.request_type='quote_request' AND v_enquiry.archived_at IS NULL
       AND v_enquiry.stage IS DISTINCT FROM 'quality_check' THEN
      UPDATE public.enquiries SET stage='quality_check',status='converted',updated_at=v_now
       WHERE id=v_enquiry_id AND business_id=p_business_id;
      INSERT INTO public.enquiry_stage_history(business_id,enquiry_id,from_stage,to_stage,changed_by,note)
      VALUES(p_business_id,v_enquiry_id,v_enquiry.stage,'quality_check',p_actor_user_id,
        'Worker signed off Workcard ' || v_job.job_number || '; senior quality review is required.');
    END IF;
  END IF;

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
$function$

REVOKE ALL ON FUNCTION public.finish_workcard_and_create_invoice(uuid,uuid,uuid,uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.finish_workcard_and_create_invoice(uuid,uuid,uuid,uuid,text) TO service_role;

CREATE OR REPLACE FUNCTION public.review_workcard_setup(p_job_id uuid, p_business_id uuid, p_actor_user_id uuid, p_decision text, p_note text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_job public.jobs%ROWTYPE;
  v_quote public.quotes%ROWTYPE;
  v_now timestamptz := now();
  v_note text := NULLIF(left(trim(COALESCE(p_note, '')), 2000), '');
  v_enquiry_id uuid;
  v_enquiry public.enquiries%ROWTYPE;
  v_has_parts boolean := false;
  v_booking_status text;
  v_next_stage text;
BEGIN
  IF p_decision NOT IN ('approved','changes_requested') THEN
    RAISE EXCEPTION 'Choose approve or request changes.';
  END IF;
  IF p_decision = 'changes_requested' AND length(COALESCE(v_note,'')) < 5 THEN
    RAISE EXCEPTION 'Describe the changes required.';
  END IF;

  SELECT * INTO v_job
  FROM public.jobs
  WHERE id = p_job_id AND business_id = p_business_id
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Workcard not found.'; END IF;

  SELECT * INTO v_quote
  FROM public.quotes
  WHERE id = v_job.quote_id AND business_id = p_business_id
  FOR UPDATE;
  IF NOT FOUND OR v_quote.status <> 'accepted' THEN
    RAISE EXCEPTION 'A Workcard can only be reviewed against an accepted quote.';
  END IF;
  IF v_job.workcard_review_status NOT IN ('pending_review','changes_requested') THEN
    RAISE EXCEPTION 'This Workcard is not awaiting setup review.';
  END IF;

  UPDATE public.jobs
  SET workcard_review_status = p_decision,
      workcard_reviewed_by = p_actor_user_id,
      workcard_reviewed_at = v_now,
      workcard_review_note = v_note,
      updated_at = v_now
  WHERE id = p_job_id;

  IF p_decision='approved' THEN
    SELECT EXISTS(
      SELECT 1 FROM public.job_work_entries e
       WHERE e.business_id=p_business_id AND e.job_id=p_job_id
         AND e.entry_type='parts' AND e.quantity_required>0
    ) INTO v_has_parts;
    SELECT status INTO v_booking_status FROM public.appointments
     WHERE id=v_job.appointment_id AND business_id=p_business_id;
    SELECT enquiry_id INTO v_enquiry_id FROM public.quotes
     WHERE id=v_job.quote_id AND business_id=p_business_id;
    IF v_enquiry_id IS NOT NULL THEN
      SELECT * INTO v_enquiry FROM public.enquiries
       WHERE id=v_enquiry_id AND business_id=p_business_id FOR UPDATE;
      v_next_stage := CASE
        WHEN v_has_parts THEN 'parts_required'
        WHEN v_booking_status='requested' THEN 'booking_requested'
        WHEN v_booking_status IN ('confirmed','rescheduled') THEN 'booked'
        ELSE 'ready_to_schedule' END;
      IF FOUND AND v_enquiry.request_type='quote_request' AND v_enquiry.archived_at IS NULL
         AND v_enquiry.stage IS DISTINCT FROM v_next_stage THEN
        UPDATE public.enquiries SET stage=v_next_stage,status='converted',updated_at=v_now
         WHERE id=v_enquiry_id AND business_id=p_business_id;
        INSERT INTO public.enquiry_stage_history(business_id,enquiry_id,from_stage,to_stage,changed_by,note)
        VALUES(p_business_id,v_enquiry_id,v_enquiry.stage,v_next_stage,p_actor_user_id,
          'Workcard setup review approved; parts and booking readiness have been reconciled.');
      END IF;
    END IF;
  END IF;

  INSERT INTO public.audit_events (
    business_id, actor_user_id, action, entity_type, entity_id, details
  ) VALUES (
    p_business_id, p_actor_user_id, 'workcard.setup_reviewed', 'job', p_job_id,
    jsonb_build_object('decision', p_decision, 'note', v_note, 'quote_id', v_job.quote_id)
  );

  RETURN jsonb_build_object(
    'success', true,
    'job_id', p_job_id,
    'workcard_review_status', p_decision,
    'reviewed_at', v_now
  );
END;
$function$

REVOKE ALL ON FUNCTION public.review_workcard_setup(uuid,uuid,uuid,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.review_workcard_setup(uuid,uuid,uuid,text,text) TO service_role;

CREATE OR REPLACE FUNCTION public.review_workcard(p_job_id uuid, p_business_id uuid, p_actor_user_id uuid, p_decision text, p_note text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_job record;
  v_enquiry_id uuid;
  v_enquiry record;
  v_next_stage text;
  v_now timestamptz := clock_timestamp();
BEGIN
  IF p_decision NOT IN ('approved','changes_requested') THEN
    RAISE EXCEPTION 'Choose approve or request changes.' USING ERRCODE = '22023';
  END IF;
  IF p_decision = 'changes_requested' AND length(trim(coalesce(p_note,''))) < 5 THEN
    RAISE EXCEPTION 'Describe the corrections required.' USING ERRCODE = '22023';
  END IF;

  SELECT id, status, senior_approval_status, worker_signed_off_at, quote_id, appointment_id
    INTO v_job
    FROM public.jobs
   WHERE id = p_job_id
     AND business_id = p_business_id
   FOR UPDATE;

  IF NOT FOUND OR v_job.status <> 'completed'
     OR v_job.senior_approval_status <> 'pending'
     OR v_job.worker_signed_off_at IS NULL THEN
    RAISE EXCEPTION 'This Workcard is not awaiting senior review.' USING ERRCODE = 'P0001';
  END IF;

  IF p_decision = 'approved' THEN
    UPDATE public.jobs
       SET senior_approval_status = 'approved',
           senior_approved_by = p_actor_user_id,
           senior_approved_at = v_now,
           senior_approval_note = NULLIF(left(trim(coalesce(p_note,'')),2000),''),
           customer_approval_status = 'pending',
           updated_at = v_now
     WHERE id = p_job_id
       AND business_id = p_business_id;
  ELSE
    UPDATE public.jobs
       SET status = 'in_progress',
           senior_approval_status = 'changes_requested',
           senior_approved_by = NULL,
           senior_approved_at = NULL,
           senior_approval_note = left(trim(p_note),2000),
           worker_signed_off_by = NULL,
           worker_signed_off_at = NULL,
           customer_approval_status = 'not_ready',
           customer_approved_at = NULL,
           updated_at = v_now
     WHERE id = p_job_id
       AND business_id = p_business_id;

    UPDATE public.job_assignments
       SET status = 'accepted'
     WHERE job_id = p_job_id
       AND status = 'completed';

    DELETE FROM public.invoices
     WHERE job_id = p_job_id
       AND business_id = p_business_id
       AND status = 'draft';
  END IF;

  IF v_job.quote_id IS NOT NULL THEN
    SELECT enquiry_id INTO v_enquiry_id FROM public.quotes WHERE id=v_job.quote_id AND business_id=p_business_id;
  END IF;
  IF v_enquiry_id IS NULL AND v_job.appointment_id IS NOT NULL THEN
    SELECT enquiry_id INTO v_enquiry_id FROM public.appointments WHERE id=v_job.appointment_id AND business_id=p_business_id;
  END IF;
  IF v_enquiry_id IS NOT NULL THEN
    SELECT id,stage,request_type,archived_at INTO v_enquiry
      FROM public.enquiries WHERE id=v_enquiry_id AND business_id=p_business_id FOR UPDATE;
    v_next_stage := CASE WHEN p_decision='approved' THEN 'ready_to_invoice' ELSE 'work_in_progress' END;
    IF FOUND AND v_enquiry.request_type='quote_request' AND v_enquiry.archived_at IS NULL
       AND v_enquiry.stage IS DISTINCT FROM v_next_stage THEN
      UPDATE public.enquiries SET stage=v_next_stage,status='converted',updated_at=v_now
       WHERE id=v_enquiry_id AND business_id=p_business_id;
      INSERT INTO public.enquiry_stage_history(business_id,enquiry_id,from_stage,to_stage,changed_by,note)
      VALUES(p_business_id,v_enquiry_id,v_enquiry.stage,v_next_stage,p_actor_user_id,
        CASE WHEN p_decision='approved'
          THEN 'Senior quality review approved the completed Workcard for customer approval and invoicing.'
          ELSE 'Senior review returned the Workcard for further work and a new sign-off.' END);
    END IF;
  END IF;

  INSERT INTO public.audit_events
    (business_id, actor_user_id, action, entity_type, entity_id, details)
  VALUES
    (p_business_id, p_actor_user_id,
     CASE WHEN p_decision = 'approved' THEN 'workcard.senior_approved' ELSE 'workcard.returned_for_correction' END,
     'job', p_job_id,
     jsonb_build_object('decision',p_decision,'note',NULLIF(left(trim(coalesce(p_note,'')),2000),''),'reviewed_at',v_now));

  RETURN jsonb_build_object('success',true,'decision',p_decision,'reviewed_at',v_now);
END;
$function$

REVOKE ALL ON FUNCTION public.review_workcard(uuid,uuid,uuid,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.review_workcard(uuid,uuid,uuid,text,text) TO service_role;

-- Customer approval must issue the invoice through the controlled issuer/GST/immutability
-- function. The issuer is the senior-approved staff user in public.users.
CREATE OR REPLACE FUNCTION public.respond_to_completed_workcard(
  p_job_id uuid,
  p_business_id uuid,
  p_actor_user_id uuid DEFAULT NULL,
  p_guest_enquiry_id uuid DEFAULT NULL,
  p_guest_token_hash text DEFAULT NULL,
  p_decision text DEFAULT NULL,
  p_note text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_job record;
  v_invoice record;
  v_enquiry record;
  v_jobcard record;
  v_enquiry_id uuid;
  v_issuer_user_id uuid;
  v_now timestamptz := clock_timestamp();
  v_message text;
BEGIN
  IF p_decision NOT IN ('approved','changes_requested') THEN
    RAISE EXCEPTION 'Choose approve or request changes.' USING ERRCODE = '22023';
  END IF;
  IF p_decision = 'changes_requested' AND length(trim(coalesce(p_note,''))) < 5 THEN
    RAISE EXCEPTION 'Describe what needs attention before submitting.' USING ERRCODE = '22023';
  END IF;

  SELECT id,business_id,user_id,customer_id,job_number,status,customer_approval_status,
         senior_approval_status,senior_approved_by,worker_signed_off_by,appointment_id,quote_id
    INTO v_job
    FROM public.jobs
   WHERE id = p_job_id AND business_id = p_business_id
   FOR UPDATE;

  IF NOT FOUND OR v_job.status <> 'completed'
     OR v_job.senior_approval_status NOT IN ('approved','legacy_approved')
     OR v_job.customer_approval_status <> 'pending' THEN
    RAISE EXCEPTION 'This Workcard is not yet approved for customer review.' USING ERRCODE = 'P0001';
  END IF;

  IF p_actor_user_id IS NOT NULL THEN
    IF v_job.user_id IS DISTINCT FROM p_actor_user_id THEN
      RAISE EXCEPTION 'This Workcard does not belong to your account.' USING ERRCODE = 'P0001';
    END IF;
  ELSE
    IF p_guest_enquiry_id IS NULL OR p_guest_token_hash IS NULL OR v_job.appointment_id IS NULL THEN
      RAISE EXCEPTION 'Guest Jobcard access is no longer available.' USING ERRCODE = 'P0001';
    END IF;
    SELECT id,business_id,contact_name,email
      INTO v_enquiry
      FROM public.enquiries
     WHERE id = p_guest_enquiry_id
       AND business_id = p_business_id
       AND request_type = 'quote_request'
       AND guest_access_token_hash = p_guest_token_hash
       AND guest_access_expires_at > v_now
     FOR UPDATE;
    IF NOT FOUND OR NOT EXISTS (
      SELECT 1 FROM public.appointments a
       WHERE a.id = v_job.appointment_id
         AND a.business_id = p_business_id
         AND a.enquiry_id = v_enquiry.id
         AND a.status = 'confirmed'
    ) THEN
      RAISE EXCEPTION 'Guest Jobcard access is no longer available.' USING ERRCODE = 'P0001';
    END IF;
  END IF;

  SELECT id,invoice_number,status
    INTO v_invoice
    FROM public.invoices
   WHERE job_id = v_job.id AND business_id = p_business_id
   FOR UPDATE;
  IF NOT FOUND OR v_invoice.status <> 'draft' THEN
    RAISE EXCEPTION 'The final invoice is not ready for customer approval.' USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.jobs
     SET customer_approval_status = p_decision,
         customer_approved_at = CASE WHEN p_decision = 'approved' THEN v_now ELSE NULL END,
         customer_approval_note = NULLIF(left(trim(coalesce(p_note,'')),2000),''),
         updated_at = v_now
   WHERE id = v_job.id AND business_id = p_business_id
     AND customer_approval_status = 'pending';

  IF p_decision = 'approved' THEN
    v_issuer_user_id := coalesce(v_job.senior_approved_by,v_job.worker_signed_off_by,p_actor_user_id);
    IF v_issuer_user_id IS NULL THEN
      RAISE EXCEPTION 'An authorised staff issuer is required before the final invoice can be issued.' USING ERRCODE = 'P0001';
    END IF;

    PERFORM public.issue_invoice(v_invoice.id,p_business_id,v_issuer_user_id);
    SELECT id,invoice_number,status
      INTO v_invoice
      FROM public.invoices
     WHERE id = v_invoice.id AND business_id = p_business_id;
    IF NOT FOUND OR v_invoice.status <> 'issued' THEN
      RAISE EXCEPTION 'The final invoice could not be issued.' USING ERRCODE = 'P0001';
    END IF;

    v_enquiry_id := p_guest_enquiry_id;
    IF v_enquiry_id IS NULL AND v_job.quote_id IS NOT NULL THEN
      SELECT enquiry_id INTO v_enquiry_id
        FROM public.quotes
       WHERE id = v_job.quote_id AND business_id = p_business_id;
    END IF;
    IF v_enquiry_id IS NULL AND v_job.appointment_id IS NOT NULL THEN
      SELECT enquiry_id INTO v_enquiry_id
        FROM public.appointments
       WHERE id = v_job.appointment_id AND business_id = p_business_id;
    END IF;

    IF v_enquiry_id IS NOT NULL THEN
      SELECT id,stage,request_type,archived_at
        INTO v_jobcard
        FROM public.enquiries
       WHERE id = v_enquiry_id AND business_id = p_business_id
       FOR UPDATE;

      IF FOUND AND v_jobcard.request_type = 'quote_request' AND v_jobcard.archived_at IS NULL
         AND v_jobcard.stage IS DISTINCT FROM 'invoiced' THEN
        UPDATE public.enquiries
           SET stage = 'invoiced',
               status = 'converted',
               updated_at = v_now
         WHERE id = v_enquiry_id AND business_id = p_business_id;

        INSERT INTO public.enquiry_stage_history
          (business_id,enquiry_id,from_stage,to_stage,changed_by,note)
        VALUES
          (p_business_id,v_enquiry_id,v_jobcard.stage,'invoiced',p_actor_user_id,
           'Customer approved the completed Workcard and the final invoice was issued.');
      END IF;
    END IF;
  END IF;

  v_message := CASE WHEN p_decision = 'approved'
    THEN 'Customer approved completed Workcard ' || v_job.job_number || '.'
    ELSE 'Customer requested changes to completed Workcard ' || v_job.job_number || ': ' || left(trim(p_note),2000)
  END;

  INSERT INTO public.customer_messages
    (business_id,customer_id,user_id,enquiry_id,quote_id,sender_type,sender_user_id,guest_name,guest_email,message,is_internal)
  VALUES
    (p_business_id,v_job.customer_id,p_actor_user_id,
     CASE WHEN p_guest_enquiry_id IS NOT NULL THEN p_guest_enquiry_id
          ELSE (SELECT enquiry_id FROM public.appointments WHERE id = v_job.appointment_id) END,
     v_job.quote_id,'customer',p_actor_user_id,
     CASE WHEN p_actor_user_id IS NULL THEN v_enquiry.contact_name ELSE NULL END,
     CASE WHEN p_actor_user_id IS NULL THEN v_enquiry.email ELSE NULL END,
     v_message,false);

  INSERT INTO public.audit_events
    (business_id,actor_user_id,action,entity_type,entity_id,details)
  VALUES
    (p_business_id,p_actor_user_id,
     CASE WHEN p_actor_user_id IS NULL THEN 'guest_work_order.customer_' ELSE 'work_order.customer_' END || p_decision,
     'job',v_job.id,
     jsonb_build_object('invoice_id',v_invoice.id,'invoice_status',CASE WHEN p_decision='approved' THEN 'issued' ELSE 'draft' END,
       'invoice_issued_by',CASE WHEN p_decision='approved' THEN v_issuer_user_id ELSE NULL END,
       'note',NULLIF(left(trim(coalesce(p_note,'')),2000),''),'request_id',p_guest_enquiry_id));

  RETURN jsonb_build_object('success',true,'decision',p_decision,
    'invoiceStatus',CASE WHEN p_decision='approved' THEN 'issued' ELSE 'draft' END,
    'invoiceNumber',v_invoice.invoice_number);
END;
$$;

REVOKE ALL ON FUNCTION public.respond_to_completed_workcard(uuid,uuid,uuid,uuid,text,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.respond_to_completed_workcard(uuid,uuid,uuid,uuid,text,text,text) TO service_role;


-- Partial payments advance the Jobcard to awaiting_payment; full settlement records
-- paid then closed, revokes guest access and archives the Jobcard atomically.
CREATE OR REPLACE FUNCTION public.record_invoice_payment_idempotent(p_invoice_id uuid, p_business_id uuid, p_actor_user_id uuid, p_amount numeric, p_method text, p_reference text, p_payment_type text, p_idempotency_key uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_invoice public.invoices%ROWTYPE;
  v_payment public.payments%ROWTYPE;
  v_job public.jobs%ROWTYPE;
  v_enquiry public.enquiries%ROWTYPE;
  v_enquiry_id uuid;
  v_credit_total numeric(12,2) := 0;
  v_amount_paid numeric(12,2);
  v_balance numeric(12,2);
  v_status text;
  v_now timestamptz := clock_timestamp();
  v_archived boolean := false;
BEGIN
  IF p_amount IS NULL OR p_amount<=0 OR p_amount>10000000 THEN
    RAISE EXCEPTION 'Enter a valid payment amount.' USING ERRCODE='22023';
  END IF;
  IF p_method NOT IN ('cash','bank_transfer','card','other') THEN
    RAISE EXCEPTION 'Select a valid payment method.' USING ERRCODE='22023';
  END IF;
  IF p_payment_type NOT IN ('deposit','part_payment','final_payment','other') OR p_idempotency_key IS NULL THEN
    RAISE EXCEPTION 'A valid payment type and request key are required.' USING ERRCODE='22023';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(p_business_id::text||':'||p_idempotency_key::text,0));
  SELECT * INTO v_payment FROM public.payments
   WHERE business_id=p_business_id AND idempotency_key=p_idempotency_key;
  IF FOUND THEN
    IF v_payment.invoice_id<>p_invoice_id OR abs(v_payment.amount-p_amount)>0.005
       OR v_payment.method IS DISTINCT FROM p_method
       OR v_payment.payment_type IS DISTINCT FROM p_payment_type
       OR v_payment.reference IS DISTINCT FROM nullif(left(trim(coalesce(p_reference,'')),120),'') THEN
      RAISE EXCEPTION 'This payment request key was already used for different payment details.' USING ERRCODE='P0001';
    END IF;
    SELECT * INTO v_invoice FROM public.invoices WHERE id=p_invoice_id AND business_id=p_business_id;
    SELECT coalesce(sum(amount),0) INTO v_credit_total FROM public.invoice_credits WHERE invoice_id=p_invoice_id AND status='issued';
    IF v_invoice.job_id IS NOT NULL THEN
      SELECT * INTO v_job FROM public.jobs WHERE id=v_invoice.job_id AND business_id=p_business_id;
      IF FOUND THEN
        IF v_job.appointment_id IS NOT NULL THEN
          SELECT enquiry_id INTO v_enquiry_id FROM public.appointments
           WHERE id=v_job.appointment_id AND business_id=p_business_id;
        END IF;
        IF v_enquiry_id IS NULL AND v_job.quote_id IS NOT NULL THEN
          SELECT enquiry_id INTO v_enquiry_id FROM public.quotes
           WHERE id=v_job.quote_id AND business_id=p_business_id;
        END IF;
        IF v_enquiry_id IS NOT NULL THEN
          SELECT archived_at IS NOT NULL INTO v_archived FROM public.enquiries
           WHERE id=v_enquiry_id AND business_id=p_business_id;
        END IF;
      END IF;
    END IF;
    RETURN jsonb_build_object('success',true,'already_recorded',true,'payment',to_jsonb(v_payment),
      'amountPaid',v_invoice.amount_paid,'creditTotal',v_credit_total,'balance',round(v_invoice.total-v_invoice.amount_paid-v_credit_total,2),'invoiceStatus',v_invoice.status,'jobcardArchived',coalesce(v_archived,false));
  END IF;

  SELECT * INTO v_invoice FROM public.invoices
   WHERE id=p_invoice_id AND business_id=p_business_id
   FOR UPDATE;
  IF NOT FOUND OR v_invoice.status NOT IN ('issued','part_paid','overdue') THEN
    RAISE EXCEPTION 'This invoice cannot accept another payment.' USING ERRCODE='P0001';
  END IF;
  SELECT coalesce(sum(amount),0) INTO v_credit_total
    FROM public.invoice_credits WHERE invoice_id=p_invoice_id AND status='issued';
  v_balance := round(v_invoice.total-v_invoice.amount_paid-v_credit_total,2);
  IF v_balance<=0 OR p_amount>v_balance+0.005 THEN
    RAISE EXCEPTION 'Payment exceeds the outstanding balance.' USING ERRCODE='22023';
  END IF;
  IF p_payment_type='final_payment' AND abs(p_amount-v_balance)>0.005 THEN
    RAISE EXCEPTION 'A final payment must equal the remaining balance.' USING ERRCODE='22023';
  END IF;

  IF v_invoice.job_id IS NOT NULL THEN
    SELECT * INTO v_job FROM public.jobs
     WHERE id=v_invoice.job_id AND business_id=p_business_id
     FOR UPDATE;
    IF NOT FOUND OR v_job.status<>'completed'
       OR coalesce(v_job.customer_approval_status,'not_ready')<>'approved'
       OR coalesce(v_job.senior_approval_status,'pending') NOT IN ('approved','legacy_approved') THEN
      RAISE EXCEPTION 'The customer-approved final Workcard is required before payment.' USING ERRCODE='P0001';
    END IF;
    IF v_job.appointment_id IS NOT NULL THEN
      SELECT enquiry_id INTO v_enquiry_id FROM public.appointments
       WHERE id=v_job.appointment_id AND business_id=p_business_id;
    END IF;
    IF v_enquiry_id IS NULL AND v_job.quote_id IS NOT NULL THEN
      SELECT enquiry_id INTO v_enquiry_id FROM public.quotes
       WHERE id=v_job.quote_id AND business_id=p_business_id;
    END IF;
  END IF;

  v_amount_paid := round(v_invoice.amount_paid+p_amount,2);
  v_status := CASE
    WHEN v_amount_paid+v_credit_total+0.005>=v_invoice.total THEN 'paid'
    WHEN v_invoice.due_date IS NOT NULL AND v_invoice.due_date<(v_now AT TIME ZONE 'Australia/Sydney')::date THEN 'overdue'
    ELSE 'part_paid' END;

  INSERT INTO public.payments
    (business_id,invoice_id,customer_id,user_id,amount,method,reference,status,paid_at,payment_type,idempotency_key)
  VALUES
    (p_business_id,v_invoice.id,v_invoice.customer_id,v_invoice.user_id,p_amount,p_method,
     nullif(left(trim(coalesce(p_reference,'')),120),''),'recorded',v_now,p_payment_type,p_idempotency_key)
  RETURNING * INTO v_payment;

  UPDATE public.invoices SET amount_paid=v_amount_paid,status=v_status,updated_at=v_now
   WHERE id=v_invoice.id AND business_id=p_business_id;

  IF v_enquiry_id IS NOT NULL THEN
    SELECT * INTO v_enquiry FROM public.enquiries
     WHERE id=v_enquiry_id AND business_id=p_business_id FOR UPDATE;
    IF FOUND AND v_enquiry.request_type='quote_request' AND v_enquiry.archived_at IS NULL THEN
      IF v_enquiry.stage NOT IN ('awaiting_payment','paid','closed') THEN
        UPDATE public.enquiries SET stage='awaiting_payment',status='converted',updated_at=v_now
         WHERE id=v_enquiry_id AND business_id=p_business_id;
        INSERT INTO public.enquiry_stage_history(business_id,enquiry_id,from_stage,to_stage,changed_by,note)
        VALUES(p_business_id,v_enquiry_id,v_enquiry.stage,'awaiting_payment',p_actor_user_id,
          'Invoice payment recorded; the remaining balance is being reconciled.');
        v_enquiry.stage := 'awaiting_payment';
      END IF;
      IF v_status='paid' THEN
        IF v_enquiry.stage IS DISTINCT FROM 'paid' THEN
          UPDATE public.enquiries SET stage='paid',status='converted',updated_at=v_now
           WHERE id=v_enquiry_id AND business_id=p_business_id;
          INSERT INTO public.enquiry_stage_history(business_id,enquiry_id,from_stage,to_stage,changed_by,note)
          VALUES(p_business_id,v_enquiry_id,v_enquiry.stage,'paid',p_actor_user_id,
            'The final invoice balance has been settled.');
          v_enquiry.stage := 'paid';
        END IF;
        UPDATE public.enquiries SET stage='closed',status='closed',archived_at=v_now,
          guest_access_token_hash=NULL,guest_access_expires_at=NULL,updated_at=v_now
         WHERE id=v_enquiry_id AND business_id=p_business_id;
        INSERT INTO public.enquiry_stage_history(business_id,enquiry_id,from_stage,to_stage,changed_by,note)
        VALUES(p_business_id,v_enquiry_id,v_enquiry.stage,'closed',p_actor_user_id,
          'Jobcard archived after final customer approval and full invoice settlement.');
        v_archived := true;
      END IF;
    END IF;
  END IF;

  INSERT INTO public.audit_events(business_id,actor_user_id,action,entity_type,entity_id,details)
  VALUES(p_business_id,p_actor_user_id,'payment.recorded','payment',v_payment.id,
    jsonb_build_object('invoice_id',v_invoice.id,'amount',p_amount,'method',p_method,'payment_type',p_payment_type,'invoice_status',v_status,'jobcard_archived',v_archived));
  RETURN jsonb_build_object('success',true,'already_recorded',false,'payment',to_jsonb(v_payment),
    'amountPaid',v_amount_paid,'creditTotal',v_credit_total,'balance',round(v_invoice.total-v_amount_paid-v_credit_total,2),'invoiceStatus',v_status,'jobcardArchived',v_archived);
END;
$function$

REVOKE ALL ON FUNCTION public.record_invoice_payment_idempotent(uuid,uuid,uuid,numeric,text,text,text,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.record_invoice_payment_idempotent(uuid,uuid,uuid,numeric,text,text,text,uuid) TO service_role;

-- Enforce booking conflicts under a business-wide transaction lock, not only in
-- application pre-checks. Ensure one active appointment per accepted quote.
DROP FUNCTION IF EXISTS public.update_jobcard_booking(uuid,uuid,uuid,uuid,text,timestamptz,timestamptz,text);

CREATE OR REPLACE FUNCTION public.update_jobcard_booking(p_business_id uuid, p_actor_user_id uuid, p_enquiry_id uuid, p_appointment_id uuid, p_action text, p_starts_at timestamp with time zone, p_ends_at timestamp with time zone, p_location text, p_bypass_conflicts boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_enquiry public.enquiries%ROWTYPE;
  v_appointment public.appointments%ROWTYPE;
  v_now timestamptz := clock_timestamp();
  v_next_stage text;
  v_workcards_updated integer := 0;
  v_settings jsonb;
  v_duration integer := 60;
  v_buffer integer := 30;
  v_candidate_end timestamptz;
  v_accepted_quote_id uuid;
BEGIN
  IF p_action NOT IN ('request','confirm','reschedule','cancel') THEN
    RAISE EXCEPTION 'Choose confirm, reschedule or cancel.' USING ERRCODE = '22023';
  END IF;
  IF p_action <> 'cancel' AND (p_starts_at IS NULL OR length(trim(coalesce(p_location,''))) < 3) THEN
    RAISE EXCEPTION 'A booking start time and service location are required.' USING ERRCODE = '22023';
  END IF;
  IF p_ends_at IS NOT NULL AND p_ends_at <= p_starts_at THEN
    RAISE EXCEPTION 'Booking end must be after its start.' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_enquiry
    FROM public.enquiries
   WHERE id = p_enquiry_id AND business_id = p_business_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Jobcard not found.' USING ERRCODE = 'P0002';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(p_business_id::text || ':brv-booking-calendar',0));

  SELECT * INTO v_appointment
    FROM public.appointments
   WHERE id = p_appointment_id AND business_id = p_business_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Booking not found.' USING ERRCODE = 'P0002';
  END IF;
  IF v_appointment.enquiry_id IS DISTINCT FROM p_enquiry_id
     AND (v_appointment.quote_id IS NULL OR NOT EXISTS (
       SELECT 1 FROM public.quotes q WHERE q.id=v_appointment.quote_id
        AND q.business_id=p_business_id AND q.enquiry_id=p_enquiry_id
     )) THEN
    RAISE EXCEPTION 'This booking does not belong to the selected Jobcard.' USING ERRCODE = 'P0001';
  END IF;
  IF v_appointment.status NOT IN ('requested','confirmed','rescheduled') THEN
    RAISE EXCEPTION 'This booking is no longer active.' USING ERRCODE = 'P0001';
  END IF;

  IF v_appointment.quote_id IS NULL THEN
    SELECT q.id INTO v_accepted_quote_id FROM public.quotes q
     WHERE q.business_id=p_business_id AND q.enquiry_id=p_enquiry_id
       AND q.quote_kind='standard' AND q.status='accepted'
     ORDER BY q.revision_number DESC LIMIT 1;
  END IF;

  IF p_action IN ('confirm','reschedule') AND NOT coalesce(p_bypass_conflicts,false) THEN
    SELECT settings INTO v_settings FROM public.business_settings WHERE business_id=p_business_id;
    IF coalesce(v_settings #>> '{booking,appointment_duration_minutes}','') ~ '^\\d+$' THEN
      v_duration := greatest(15,least(480,(v_settings #>> '{booking,appointment_duration_minutes}')::integer));
    END IF;
    IF coalesce(v_settings #>> '{booking,travel_buffer_minutes}','') ~ '^\\d+$' THEN
      v_buffer := greatest(0,least(240,(v_settings #>> '{booking,travel_buffer_minutes}')::integer));
    END IF;
    v_candidate_end := coalesce(p_ends_at,p_starts_at + make_interval(mins => v_duration));
    IF EXISTS (
      SELECT 1 FROM public.appointments a
       WHERE a.business_id=p_business_id AND a.id<>p_appointment_id
         AND a.status IN ('confirmed','rescheduled') AND a.starts_at IS NOT NULL
         AND p_starts_at < coalesce(a.ends_at,a.starts_at + make_interval(mins => v_duration)) + make_interval(mins => v_buffer)
         AND v_candidate_end + make_interval(mins => v_buffer) > a.starts_at
    ) THEN
      RAISE EXCEPTION 'That time conflicts with another booking or its travel buffer.' USING ERRCODE = 'P0001';
    END IF;
  END IF;

  PERFORM 1 FROM public.jobs j
   WHERE j.business_id = p_business_id
     AND (j.appointment_id = p_appointment_id OR (coalesce(v_appointment.quote_id,v_accepted_quote_id) IS NOT NULL AND j.quote_id = coalesce(v_appointment.quote_id,v_accepted_quote_id)))
   FOR UPDATE;

  IF p_action = 'request' AND EXISTS (
    SELECT 1 FROM public.jobs j
     WHERE j.business_id = p_business_id
       AND (j.appointment_id = p_appointment_id OR (v_appointment.quote_id IS NOT NULL AND j.quote_id = v_appointment.quote_id))
       AND j.status <> 'pending'
  ) THEN
    RAISE EXCEPTION 'A booking request can only be attached to a pending Workcard.' USING ERRCODE = 'P0001';
  END IF;
  IF p_action = 'cancel' AND EXISTS (
    SELECT 1 FROM public.jobs j
     WHERE j.business_id = p_business_id
       AND (j.appointment_id = p_appointment_id OR (v_appointment.quote_id IS NOT NULL AND j.quote_id = v_appointment.quote_id))
       AND j.status NOT IN ('pending','scheduled')
  ) THEN
    RAISE EXCEPTION 'A booking cannot be cancelled after workshop work has started or the Workcard has closed.' USING ERRCODE = 'P0001';
  END IF;
  IF p_action IN ('confirm','reschedule') AND EXISTS (
    SELECT 1 FROM public.jobs j
     WHERE j.business_id = p_business_id
       AND (j.appointment_id = p_appointment_id OR (v_appointment.quote_id IS NOT NULL AND j.quote_id = v_appointment.quote_id))
       AND j.status IN ('in_progress','waiting_parts','completed','cancelled')
  ) THEN
    RAISE EXCEPTION 'A booking cannot be changed after workshop work has started or the Workcard has closed.' USING ERRCODE = 'P0001';
  END IF;

  IF p_action = 'cancel' THEN
    UPDATE public.appointments
       SET status = 'cancelled', updated_at = v_now
     WHERE id = p_appointment_id AND business_id = p_business_id
     RETURNING * INTO v_appointment;
  ELSIF p_action = 'request' THEN
    UPDATE public.appointments
       SET status = 'requested',
           preferred_start = p_starts_at,
           preferred_end = p_ends_at,
           location = left(trim(p_location),200),
           updated_at = v_now
     WHERE id = p_appointment_id AND business_id = p_business_id
     RETURNING * INTO v_appointment;
  ELSE
    UPDATE public.appointments
       SET status = CASE WHEN p_action='confirm' THEN 'confirmed' ELSE 'rescheduled' END,
           starts_at = p_starts_at,
           ends_at = p_ends_at,
           location = left(trim(p_location),200),
           confirmed_by = p_actor_user_id,
           confirmed_at = v_now,
           updated_at = v_now
     WHERE id = p_appointment_id AND business_id = p_business_id
     RETURNING * INTO v_appointment;
  END IF;

  UPDATE public.jobs
     SET appointment_id = CASE WHEN p_action='cancel' THEN NULL ELSE p_appointment_id END,
         status = CASE
           WHEN p_action='cancel' AND status='scheduled' THEN 'pending'
           WHEN p_action IN ('confirm','reschedule') AND status='pending' THEN 'scheduled'
           ELSE status
         END,
         scheduled_start = CASE
           WHEN p_action='cancel' AND status='scheduled' THEN NULL
           WHEN p_action IN ('confirm','reschedule') THEN p_starts_at
           ELSE scheduled_start
         END,
         scheduled_end = CASE
           WHEN p_action='cancel' AND status='scheduled' THEN NULL
           WHEN p_action IN ('confirm','reschedule') THEN p_ends_at
           ELSE scheduled_end
         END,
         updated_at = v_now
   WHERE business_id = p_business_id
     AND (appointment_id = p_appointment_id OR (coalesce(v_appointment.quote_id,v_accepted_quote_id) IS NOT NULL AND quote_id = coalesce(v_appointment.quote_id,v_accepted_quote_id)));
  GET DIAGNOSTICS v_workcards_updated = ROW_COUNT;

  v_next_stage := CASE WHEN p_action='cancel' THEN 'ready_to_schedule' WHEN p_action='request' THEN 'booking_requested' ELSE 'booked' END;
  IF v_enquiry.stage IN ('approved','workcard_created','ready_to_schedule','booking_requested','booked')
     AND v_enquiry.stage IS DISTINCT FROM v_next_stage THEN
    UPDATE public.enquiries
       SET stage = v_next_stage, status = 'converted', updated_at = v_now
     WHERE id = p_enquiry_id AND business_id = p_business_id;
    INSERT INTO public.enquiry_stage_history
      (business_id,enquiry_id,from_stage,to_stage,changed_by,note)
    VALUES
      (p_business_id,p_enquiry_id,v_enquiry.stage,v_next_stage,p_actor_user_id,
       CASE WHEN p_action='cancel' THEN 'Booking cancelled; return to scheduling.'
            WHEN p_action='request' THEN 'Booking requested by the assigned worker.'
            ELSE 'Booking ' || CASE WHEN p_action='confirm' THEN 'confirmed' ELSE 'rescheduled' END || ' from the Jobcard.' END);
  END IF;

  INSERT INTO public.audit_events
    (business_id,actor_user_id,action,entity_type,entity_id,details)
  VALUES
    (p_business_id,p_actor_user_id,'workcard.booking_'||p_action,'appointment',p_appointment_id,
     jsonb_build_object('enquiry_id',p_enquiry_id,'quote_id',v_appointment.quote_id,
       'workcards_updated',v_workcards_updated,'starts_at',v_appointment.starts_at,
       'ends_at',v_appointment.ends_at,'location',v_appointment.location));

  RETURN jsonb_build_object('appointment',to_jsonb(v_appointment),'workcardsUpdated',v_workcards_updated);
END;
$function$

CREATE UNIQUE INDEX IF NOT EXISTS appointments_one_active_quote_booking_uidx
  ON public.appointments (business_id, quote_id)
  WHERE quote_id IS NOT NULL AND status IN ('requested','confirmed','rescheduled');


REVOKE ALL ON FUNCTION public.update_jobcard_booking(uuid,uuid,uuid,uuid,text,timestamptz,timestamptz,text,boolean) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.update_jobcard_booking(uuid,uuid,uuid,uuid,text,timestamptz,timestamptz,text,boolean) TO service_role;

