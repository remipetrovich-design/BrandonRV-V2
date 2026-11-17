-- Keep invoice issuer references on the application's canonical identity table.
-- Issued invoices retain their issuer as part of the immutable audit history.
ALTER TABLE public.invoices
  DROP CONSTRAINT IF EXISTS invoices_issued_by_fkey;

ALTER TABLE public.invoices
  ADD CONSTRAINT invoices_issued_by_fkey
  FOREIGN KEY (issued_by) REFERENCES public.users(id) ON DELETE RESTRICT;

-- Preserve the customer-approval transaction while issuing the invoice through the
-- canonical invoice lifecycle (including issue timestamp, issuer, totals and GST checks).
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
  v_issue_actor_id uuid;
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
    -- The invoice issuer is the senior reviewer (or the worker for legacy-approved
    -- records), never the customer who is submitting this approval.
    v_issue_actor_id := coalesce(v_job.senior_approved_by,v_job.worker_signed_off_by);
    IF v_issue_actor_id IS NULL THEN
      RAISE EXCEPTION 'A staff issuer is required before the final invoice can be issued.' USING ERRCODE = 'P0001';
    END IF;

    -- This performs the canonical line-total, GST and immutable issue checks and
    -- writes issued_at/issued_by in this same transaction.
    PERFORM public.issue_invoice(v_invoice.id,p_business_id,v_issue_actor_id);

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
    (p_business_id,v_job.customer_id,p_actor_user_id,v_enquiry_id,
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
       'note',NULLIF(left(trim(coalesce(p_note,'')),2000),''),'request_id',v_enquiry_id));

  RETURN jsonb_build_object('success',true,'decision',p_decision,
    'invoiceStatus',CASE WHEN p_decision='approved' THEN 'issued' ELSE 'draft' END,
    'invoiceNumber',v_invoice.invoice_number);
END;
$$;

REVOKE ALL ON FUNCTION public.respond_to_completed_workcard(uuid,uuid,uuid,uuid,text,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.respond_to_completed_workcard(uuid,uuid,uuid,uuid,text,text,text) TO service_role;

-- Keep the original Jobcard stage aligned with the invoice settlement lifecycle.
CREATE OR REPLACE FUNCTION public.record_invoice_payment_idempotent(
  p_invoice_id uuid,
  p_business_id uuid,
  p_actor_user_id uuid,
  p_amount numeric,
  p_method text,
  p_reference text,
  p_payment_type text,
  p_idempotency_key uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
    SELECT * INTO v_invoice FROM public.invoices
     WHERE id=p_invoice_id AND business_id=p_business_id;
    SELECT coalesce(sum(amount),0) INTO v_credit_total
      FROM public.invoice_credits WHERE invoice_id=p_invoice_id AND status='issued';
    IF v_invoice.job_id IS NOT NULL THEN
      SELECT * INTO v_job FROM public.jobs
       WHERE id=v_invoice.job_id AND business_id=p_business_id;
      IF FOUND THEN
        IF v_job.appointment_id IS NOT NULL THEN
          SELECT enquiry_id INTO v_enquiry_id FROM public.appointments
           WHERE id=v_job.appointment_id AND business_id=p_business_id;
        END IF;
        IF v_enquiry_id IS NULL AND v_job.quote_id IS NOT NULL THEN
          SELECT enquiry_id INTO v_enquiry_id FROM public.quotes
           WHERE id=v_job.quote_id AND business_id=p_business_id;
        END IF;
      END IF;
    END IF;
    IF v_enquiry_id IS NOT NULL THEN
      SELECT * INTO v_enquiry FROM public.enquiries
       WHERE id=v_enquiry_id AND business_id=p_business_id;
      v_archived := FOUND AND v_enquiry.stage='paid' AND v_enquiry.archived_at IS NOT NULL;
    END IF;
    RETURN jsonb_build_object('success',true,'already_recorded',true,'payment',to_jsonb(v_payment),
      'amountPaid',v_invoice.amount_paid,'creditTotal',v_credit_total,
      'balance',round(v_invoice.total-v_invoice.amount_paid-v_credit_total,2),
      'invoiceStatus',v_invoice.status,'jobcardArchived',v_archived);
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
     WHERE id=v_enquiry_id AND business_id=p_business_id
     FOR UPDATE;
    IF FOUND AND v_enquiry.request_type='quote_request' THEN
      IF v_status='paid' AND v_enquiry.archived_at IS NULL THEN
        UPDATE public.enquiries SET stage='paid',status='closed',archived_at=v_now,
          guest_access_token_hash=NULL,guest_access_expires_at=NULL,updated_at=v_now
         WHERE id=v_enquiry_id AND business_id=p_business_id;
        INSERT INTO public.enquiry_stage_history(business_id,enquiry_id,from_stage,to_stage,changed_by,note)
        VALUES(p_business_id,v_enquiry_id,v_enquiry.stage,'paid',p_actor_user_id,
          'Jobcard archived after final customer approval and full invoice settlement.');
        v_archived := true;
      ELSIF v_status IN ('part_paid','overdue') AND v_enquiry.archived_at IS NULL
         AND v_enquiry.stage IS DISTINCT FROM 'awaiting_payment' THEN
        UPDATE public.enquiries SET stage='awaiting_payment',status='converted',updated_at=v_now
         WHERE id=v_enquiry_id AND business_id=p_business_id;
        INSERT INTO public.enquiry_stage_history(business_id,enquiry_id,from_stage,to_stage,changed_by,note)
        VALUES(p_business_id,v_enquiry_id,v_enquiry.stage,'awaiting_payment',p_actor_user_id,
          'A payment was recorded and an outstanding invoice balance remains.');
      END IF;
    END IF;
  END IF;

  INSERT INTO public.audit_events(business_id,actor_user_id,action,entity_type,entity_id,details)
  VALUES(p_business_id,p_actor_user_id,'payment.recorded','payment',v_payment.id,
    jsonb_build_object('invoice_id',v_invoice.id,'amount',p_amount,'method',p_method,
      'payment_type',p_payment_type,'invoice_status',v_status,'jobcard_archived',v_archived));
  RETURN jsonb_build_object('success',true,'already_recorded',false,'payment',to_jsonb(v_payment),
    'amountPaid',v_amount_paid,'creditTotal',v_credit_total,
    'balance',round(v_invoice.total-v_amount_paid-v_credit_total,2),
    'invoiceStatus',v_status,'jobcardArchived',v_archived);
END;
$$;

REVOKE ALL ON FUNCTION public.record_invoice_payment_idempotent(uuid,uuid,uuid,numeric,text,text,text,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.record_invoice_payment_idempotent(uuid,uuid,uuid,numeric,text,text,text,uuid) TO service_role;

-- An invoice line cannot be moved out of an issued invoice into a draft invoice.
-- Check both its old and new parent when an UPDATE changes invoice_id.
CREATE OR REPLACE FUNCTION public.prevent_issued_invoice_item_edits()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_status text;
BEGIN
  IF TG_OP='DELETE' OR TG_OP='UPDATE' THEN
    SELECT status INTO v_status
      FROM public.invoices
     WHERE id=OLD.invoice_id;
    IF v_status IS DISTINCT FROM 'draft' THEN
      RAISE EXCEPTION 'Issued invoice lines are immutable. Create a credit note for an adjustment.' USING ERRCODE='P0001';
    END IF;
  END IF;

  IF TG_OP='INSERT' OR TG_OP='UPDATE' THEN
    SELECT status INTO v_status
      FROM public.invoices
     WHERE id=NEW.invoice_id;
    IF v_status IS DISTINCT FROM 'draft' THEN
      RAISE EXCEPTION 'Issued invoice lines are immutable. Create a credit note for an adjustment.' USING ERRCODE='P0001';
    END IF;
  END IF;

  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;
