-- Invoice issue controls, immutable issued documents, idempotent payments,
-- explicit refunds/credit notes and overdue reconciliation.
ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS issued_at timestamptz,
  ADD COLUMN IF NOT EXISTS issued_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public.invoices DROP CONSTRAINT IF EXISTS invoices_status_check;
ALTER TABLE public.invoices
  ADD CONSTRAINT invoices_status_check
  CHECK (status IN ('draft','issued','part_paid','paid','overdue','void','credited'));

ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS payment_type text NOT NULL DEFAULT 'part_payment',
  ADD COLUMN IF NOT EXISTS idempotency_key uuid;

ALTER TABLE public.payments DROP CONSTRAINT IF EXISTS payments_payment_type_check;
ALTER TABLE public.payments
  ADD CONSTRAINT payments_payment_type_check
  CHECK (payment_type IN ('deposit','part_payment','final_payment','other'));

CREATE UNIQUE INDEX IF NOT EXISTS payments_business_idempotency_uidx
  ON public.payments(business_id,idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.invoice_refunds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  invoice_id uuid NOT NULL REFERENCES public.invoices(id) ON DELETE RESTRICT,
  payment_id uuid NOT NULL REFERENCES public.payments(id) ON DELETE RESTRICT,
  amount numeric(12,2) NOT NULL CHECK (amount > 0),
  method text NOT NULL CHECK (method IN ('cash','bank_transfer','card','other')),
  reference text,
  reason text NOT NULL CHECK (length(trim(reason)) >= 3),
  status text NOT NULL DEFAULT 'recorded' CHECK (status IN ('recorded','void')),
  idempotency_key uuid NOT NULL,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS invoice_refunds_business_idempotency_uidx
  ON public.invoice_refunds(business_id,idempotency_key);
CREATE INDEX IF NOT EXISTS invoice_refunds_invoice_created_idx
  ON public.invoice_refunds(invoice_id,created_at DESC);
CREATE INDEX IF NOT EXISTS invoice_refunds_payment_idx
  ON public.invoice_refunds(payment_id);

CREATE TABLE IF NOT EXISTS public.invoice_credits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  invoice_id uuid NOT NULL REFERENCES public.invoices(id) ON DELETE RESTRICT,
  credit_number text NOT NULL,
  amount numeric(12,2) NOT NULL CHECK (amount > 0),
  reason text NOT NULL CHECK (length(trim(reason)) >= 3),
  status text NOT NULL DEFAULT 'issued' CHECK (status IN ('issued','void')),
  idempotency_key uuid NOT NULL,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (business_id,credit_number)
);

CREATE UNIQUE INDEX IF NOT EXISTS invoice_credits_business_idempotency_uidx
  ON public.invoice_credits(business_id,idempotency_key);
CREATE INDEX IF NOT EXISTS invoice_credits_invoice_created_idx
  ON public.invoice_credits(invoice_id,created_at DESC);

ALTER TABLE public.invoice_refunds ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoice_credits ENABLE ROW LEVEL SECURITY;
GRANT ALL ON public.invoice_refunds,public.invoice_credits TO service_role;

CREATE OR REPLACE FUNCTION public.prevent_issued_invoice_edits()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_OP='DELETE' THEN
    IF OLD.status <> 'draft' THEN
      RAISE EXCEPTION 'Issued invoices are immutable and cannot be deleted.' USING ERRCODE='P0001';
    END IF;
    RETURN OLD;
  END IF;

  IF OLD.status <> 'draft' THEN
    IF ROW(NEW.business_id,NEW.customer_id,NEW.user_id,NEW.job_id,NEW.quote_id,
           NEW.invoice_number,NEW.issue_date,NEW.due_date,NEW.subtotal,NEW.tax_amount,
           NEW.total,NEW.notes,NEW.workcard_signoff_invoice)
       IS DISTINCT FROM
       ROW(OLD.business_id,OLD.customer_id,OLD.user_id,OLD.job_id,OLD.quote_id,
           OLD.invoice_number,OLD.issue_date,OLD.due_date,OLD.subtotal,OLD.tax_amount,
           OLD.total,OLD.notes,OLD.workcard_signoff_invoice) THEN
      RAISE EXCEPTION 'Issued invoice details cannot be changed. Create a credit note for an adjustment.' USING ERRCODE='P0001';
    END IF;
    IF NEW.status IS DISTINCT FROM OLD.status AND NOT (
      (OLD.status='issued' AND NEW.status IN ('part_paid','paid','overdue','void','credited')) OR
      (OLD.status='part_paid' AND NEW.status IN ('issued','paid','overdue','void','credited')) OR
      (OLD.status='overdue' AND NEW.status IN ('issued','part_paid','paid','void','credited')) OR
      (OLD.status='paid' AND NEW.status IN ('issued','part_paid','overdue','void')) OR
      (OLD.status='credited' AND NEW.status IN ('issued','part_paid','overdue','void'))
    ) THEN
      RAISE EXCEPTION 'Invalid invoice status transition.' USING ERRCODE='P0001';
    END IF;
    IF NEW.issued_at IS DISTINCT FROM OLD.issued_at OR NEW.issued_by IS DISTINCT FROM OLD.issued_by THEN
      RAISE EXCEPTION 'Invoice issue history cannot be changed.' USING ERRCODE='P0001';
    END IF;
  ELSE
    IF NEW.status NOT IN ('draft','issued','void') THEN
      RAISE EXCEPTION 'A draft invoice must be issued or voided before settlement.' USING ERRCODE='P0001';
    END IF;
    IF NEW.status='issued' AND (NEW.issued_at IS NULL OR NEW.issued_by IS NULL) THEN
      RAISE EXCEPTION 'Issued invoices require an issue timestamp and issuer.' USING ERRCODE='P0001';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS invoices_prevent_issued_edits ON public.invoices;
CREATE TRIGGER invoices_prevent_issued_edits
BEFORE UPDATE OR DELETE ON public.invoices
FOR EACH ROW EXECUTE FUNCTION public.prevent_issued_invoice_edits();

CREATE OR REPLACE FUNCTION public.prevent_issued_invoice_item_edits()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_invoice_id uuid;
  v_status text;
BEGIN
  v_invoice_id := CASE WHEN TG_OP='DELETE' THEN OLD.invoice_id ELSE NEW.invoice_id END;
  SELECT status INTO v_status FROM public.invoices WHERE id=v_invoice_id;
  IF v_status IS DISTINCT FROM 'draft' THEN
    RAISE EXCEPTION 'Issued invoice lines are immutable. Create a credit note for an adjustment.' USING ERRCODE='P0001';
  END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS invoice_items_prevent_issued_edits ON public.invoice_items;
CREATE TRIGGER invoice_items_prevent_issued_edits
BEFORE INSERT OR UPDATE OR DELETE ON public.invoice_items
FOR EACH ROW EXECUTE FUNCTION public.prevent_issued_invoice_item_edits();

CREATE OR REPLACE FUNCTION public.issue_invoice(
  p_invoice_id uuid,
  p_business_id uuid,
  p_actor_user_id uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_invoice public.invoices%ROWTYPE;
  v_job public.jobs%ROWTYPE;
  v_settings jsonb;
  v_pricing jsonb;
  v_gst_status text;
  v_gst_rate numeric(5,2);
  v_item_count integer;
  v_subtotal numeric(12,2);
  v_tax_amount numeric(12,2);
  v_now timestamptz := clock_timestamp();
BEGIN
  SELECT * INTO v_invoice FROM public.invoices
   WHERE id=p_invoice_id AND business_id=p_business_id
   FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Invoice not found.' USING ERRCODE='P0002'; END IF;
  IF v_invoice.status IN ('issued','part_paid','paid','overdue','credited') THEN
    RETURN jsonb_build_object('success',true,'already_issued',true,'invoice',to_jsonb(v_invoice));
  END IF;
  IF v_invoice.status<>'draft' OR v_invoice.job_id IS NULL THEN
    RAISE EXCEPTION 'Only a draft Workcard invoice can be issued.' USING ERRCODE='P0001';
  END IF;

  SELECT * INTO v_job FROM public.jobs
   WHERE id=v_invoice.job_id AND business_id=p_business_id
   FOR UPDATE;
  IF NOT FOUND OR v_job.status<>'completed' OR v_job.worker_signed_off_at IS NULL
     OR v_job.senior_approval_status NOT IN ('approved','legacy_approved')
     OR v_job.customer_approval_status<>'approved' THEN
    RAISE EXCEPTION 'The Workcard must be signed off, senior-approved and customer-approved before its invoice can be issued.' USING ERRCODE='P0001';
  END IF;

  SELECT count(*),
         coalesce(sum(round(quantity*unit_price,2)),0),
         coalesce(round(sum(round(quantity*unit_price,2)*tax_rate/100),2),0)
    INTO v_item_count,v_subtotal,v_tax_amount
    FROM public.invoice_items WHERE invoice_id=v_invoice.id;
  IF v_item_count=0 THEN RAISE EXCEPTION 'An invoice must contain at least one line.' USING ERRCODE='P0001'; END IF;
  IF abs(v_subtotal-v_invoice.subtotal)>0.01 OR abs(v_tax_amount-v_invoice.tax_amount)>0.01
     OR abs(v_subtotal+v_tax_amount-v_invoice.total)>0.01 THEN
    RAISE EXCEPTION 'Invoice totals do not reconcile with the invoice lines.' USING ERRCODE='P0001';
  END IF;

  SELECT settings INTO v_settings FROM public.business_settings WHERE business_id=p_business_id;
  v_pricing := coalesce(v_settings->'pricing','{}'::jsonb);
  v_gst_status := coalesce(v_pricing->>'gst_status','not_configured');
  v_gst_rate := coalesce(nullif(v_pricing->>'gst_rate','')::numeric,10);
  IF v_gst_status='registered' THEN
    IF EXISTS(SELECT 1 FROM public.invoice_items WHERE invoice_id=v_invoice.id AND abs(tax_rate-v_gst_rate)>0.001) THEN
      RAISE EXCEPTION 'Invoice GST does not match the configured business GST rate.' USING ERRCODE='P0001';
    END IF;
  ELSE
    IF EXISTS(SELECT 1 FROM public.invoice_items WHERE invoice_id=v_invoice.id AND tax_rate>0) THEN
      RAISE EXCEPTION 'GST cannot be charged until the business GST position is confirmed as registered.' USING ERRCODE='P0001';
    END IF;
  END IF;

  UPDATE public.invoices
     SET status='issued',issue_date=(v_now AT TIME ZONE 'Australia/Sydney')::date,
         issued_at=v_now,issued_by=p_actor_user_id,updated_at=v_now
   WHERE id=v_invoice.id AND business_id=p_business_id
   RETURNING * INTO v_invoice;

  INSERT INTO public.audit_events(business_id,actor_user_id,action,entity_type,entity_id,details)
  VALUES(p_business_id,p_actor_user_id,'invoice.issued','invoice',v_invoice.id,
    jsonb_build_object('invoice_number',v_invoice.invoice_number,'job_id',v_invoice.job_id,'total',v_invoice.total));
  RETURN jsonb_build_object('success',true,'already_issued',false,'invoice',to_jsonb(v_invoice));
END;
$$;

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
    SELECT * INTO v_invoice FROM public.invoices WHERE id=p_invoice_id AND business_id=p_business_id;
    SELECT coalesce(sum(amount),0) INTO v_credit_total FROM public.invoice_credits WHERE invoice_id=p_invoice_id AND status='issued';
    RETURN jsonb_build_object('success',true,'already_recorded',true,'payment',to_jsonb(v_payment),
      'amountPaid',v_invoice.amount_paid,'creditTotal',v_credit_total,'balance',round(v_invoice.total-v_invoice.amount_paid-v_credit_total,2),'invoiceStatus',v_invoice.status,'jobcardArchived',false);
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
       OR v_job.customer_approval_status<>'approved'
       OR v_job.senior_approval_status NOT IN ('approved','legacy_approved') THEN
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

  IF v_status='paid' AND v_enquiry_id IS NOT NULL THEN
    SELECT * INTO v_enquiry FROM public.enquiries
     WHERE id=v_enquiry_id AND business_id=p_business_id FOR UPDATE;
    IF FOUND AND v_enquiry.request_type='quote_request' AND v_enquiry.archived_at IS NULL THEN
      UPDATE public.enquiries SET stage='closed',status='closed',archived_at=v_now,
        guest_access_token_hash=NULL,guest_access_expires_at=NULL,updated_at=v_now
       WHERE id=v_enquiry_id AND business_id=p_business_id;
      INSERT INTO public.enquiry_stage_history(business_id,enquiry_id,from_stage,to_stage,changed_by,note)
      VALUES(p_business_id,v_enquiry_id,v_enquiry.stage,'closed',p_actor_user_id,
        'Jobcard archived after final customer approval and full invoice settlement.');
      v_archived := true;
    END IF;
  END IF;

  INSERT INTO public.audit_events(business_id,actor_user_id,action,entity_type,entity_id,details)
  VALUES(p_business_id,p_actor_user_id,'payment.recorded','payment',v_payment.id,
    jsonb_build_object('invoice_id',v_invoice.id,'amount',p_amount,'method',p_method,'payment_type',p_payment_type,'invoice_status',v_status,'jobcard_archived',v_archived));
  RETURN jsonb_build_object('success',true,'already_recorded',false,'payment',to_jsonb(v_payment),
    'amountPaid',v_amount_paid,'creditTotal',v_credit_total,'balance',round(v_invoice.total-v_amount_paid-v_credit_total,2),'invoiceStatus',v_status,'jobcardArchived',v_archived);
END;
$$;

CREATE OR REPLACE FUNCTION public.record_invoice_refund(
  p_invoice_id uuid,
  p_business_id uuid,
  p_actor_user_id uuid,
  p_payment_id uuid,
  p_amount numeric,
  p_method text,
  p_reference text,
  p_reason text,
  p_idempotency_key uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_invoice public.invoices%ROWTYPE;
  v_payment public.payments%ROWTYPE;
  v_refund public.invoice_refunds%ROWTYPE;
  v_refunded numeric(12,2) := 0;
  v_credit_total numeric(12,2) := 0;
  v_amount_paid numeric(12,2);
  v_status text;
  v_now timestamptz := clock_timestamp();
BEGIN
  IF p_amount IS NULL OR p_amount<=0 OR p_amount>10000000 OR length(trim(coalesce(p_reason,'')))<3 OR p_idempotency_key IS NULL THEN
    RAISE EXCEPTION 'Enter a valid refund amount, reason and request key.' USING ERRCODE='22023';
  END IF;
  IF p_method NOT IN ('cash','bank_transfer','card','other') THEN
    RAISE EXCEPTION 'Select a valid refund method.' USING ERRCODE='22023';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(p_business_id::text||':'||p_idempotency_key::text,0));
  SELECT * INTO v_refund FROM public.invoice_refunds
   WHERE business_id=p_business_id AND idempotency_key=p_idempotency_key;
  IF FOUND THEN
    IF v_refund.invoice_id<>p_invoice_id OR v_refund.payment_id<>p_payment_id
       OR abs(v_refund.amount-p_amount)>0.005 OR v_refund.method IS DISTINCT FROM p_method
       OR v_refund.reference IS DISTINCT FROM nullif(left(trim(coalesce(p_reference,'')),120),'')
       OR v_refund.reason IS DISTINCT FROM left(trim(p_reason),1000) THEN
      RAISE EXCEPTION 'This refund request key was already used for different details.' USING ERRCODE='P0001';
    END IF;
    SELECT * INTO v_invoice FROM public.invoices WHERE id=p_invoice_id AND business_id=p_business_id;
    SELECT coalesce(sum(amount),0) INTO v_credit_total FROM public.invoice_credits WHERE invoice_id=p_invoice_id AND status='issued';
    RETURN jsonb_build_object('success',true,'already_recorded',true,'refund',to_jsonb(v_refund),
      'amountPaid',v_invoice.amount_paid,'creditTotal',v_credit_total,'balance',round(v_invoice.total-v_invoice.amount_paid-v_credit_total,2),'invoiceStatus',v_invoice.status);
  END IF;

  SELECT * INTO v_invoice FROM public.invoices WHERE id=p_invoice_id AND business_id=p_business_id FOR UPDATE;
  IF NOT FOUND OR v_invoice.status IN ('draft','void') THEN
    RAISE EXCEPTION 'This invoice cannot be refunded.' USING ERRCODE='P0001';
  END IF;
  SELECT * INTO v_payment FROM public.payments
   WHERE id=p_payment_id AND invoice_id=p_invoice_id AND business_id=p_business_id
   FOR UPDATE;
  IF NOT FOUND OR v_payment.status NOT IN ('recorded','refunded') THEN
    RAISE EXCEPTION 'The selected recorded payment cannot be refunded.' USING ERRCODE='P0001';
  END IF;
  SELECT coalesce(sum(amount),0) INTO v_refunded FROM public.invoice_refunds
   WHERE payment_id=p_payment_id AND status='recorded';
  IF p_amount>v_payment.amount-v_refunded+0.005 THEN
    RAISE EXCEPTION 'Refund exceeds the unrefunded amount of this payment.' USING ERRCODE='22023';
  END IF;
  SELECT coalesce(sum(amount),0) INTO v_credit_total FROM public.invoice_credits
   WHERE invoice_id=p_invoice_id AND status='issued';
  v_amount_paid := round(v_invoice.amount_paid-p_amount,2);
  IF v_amount_paid<0 THEN RAISE EXCEPTION 'Refund exceeds the invoice payments received.' USING ERRCODE='22023'; END IF;
  v_status := CASE
    WHEN v_amount_paid+v_credit_total+0.005>=v_invoice.total THEN CASE WHEN v_amount_paid>0 THEN 'paid' ELSE 'credited' END
    WHEN v_invoice.due_date IS NOT NULL AND v_invoice.due_date<(v_now AT TIME ZONE 'Australia/Sydney')::date THEN 'overdue'
    WHEN v_amount_paid>0 THEN 'part_paid'
    ELSE 'issued' END;

  INSERT INTO public.invoice_refunds
    (business_id,invoice_id,payment_id,amount,method,reference,reason,idempotency_key,created_by,created_at)
  VALUES
    (p_business_id,p_invoice_id,p_payment_id,p_amount,p_method,
     nullif(left(trim(coalesce(p_reference,'')),120),''),left(trim(p_reason),1000),
     p_idempotency_key,p_actor_user_id,v_now)
  RETURNING * INTO v_refund;

  IF v_refunded+p_amount+0.005>=v_payment.amount THEN
    UPDATE public.payments SET status='refunded' WHERE id=p_payment_id AND business_id=p_business_id;
  END IF;
  UPDATE public.invoices SET amount_paid=v_amount_paid,status=v_status,updated_at=v_now
   WHERE id=p_invoice_id AND business_id=p_business_id;
  INSERT INTO public.audit_events(business_id,actor_user_id,action,entity_type,entity_id,details)
  VALUES(p_business_id,p_actor_user_id,'payment.refund_recorded','invoice_refund',v_refund.id,
    jsonb_build_object('invoice_id',p_invoice_id,'payment_id',p_payment_id,'amount',p_amount,'method',p_method,'reason',left(trim(p_reason),1000),'invoice_status',v_status));
  RETURN jsonb_build_object('success',true,'already_recorded',false,'refund',to_jsonb(v_refund),
    'amountPaid',v_amount_paid,'creditTotal',v_credit_total,'balance',round(v_invoice.total-v_amount_paid-v_credit_total,2),'invoiceStatus',v_status);
END;
$$;

CREATE OR REPLACE FUNCTION public.record_invoice_credit(
  p_invoice_id uuid,
  p_business_id uuid,
  p_actor_user_id uuid,
  p_amount numeric,
  p_reason text,
  p_idempotency_key uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_invoice public.invoices%ROWTYPE;
  v_credit public.invoice_credits%ROWTYPE;
  v_credit_total numeric(12,2) := 0;
  v_amount_paid numeric(12,2);
  v_status text;
  v_now timestamptz := clock_timestamp();
  v_enquiry_id uuid;
  v_job public.jobs%ROWTYPE;
  v_enquiry public.enquiries%ROWTYPE;
BEGIN
  IF p_amount IS NULL OR p_amount<=0 OR p_amount>10000000 OR length(trim(coalesce(p_reason,'')))<3 OR p_idempotency_key IS NULL THEN
    RAISE EXCEPTION 'Enter a valid credit amount, reason and request key.' USING ERRCODE='22023';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(p_business_id::text||':'||p_idempotency_key::text,0));
  SELECT * INTO v_credit FROM public.invoice_credits
   WHERE business_id=p_business_id AND idempotency_key=p_idempotency_key;
  IF FOUND THEN
    IF v_credit.invoice_id<>p_invoice_id OR abs(v_credit.amount-p_amount)>0.005
       OR v_credit.reason IS DISTINCT FROM left(trim(p_reason),1000) THEN
      RAISE EXCEPTION 'This credit request key was already used for different details.' USING ERRCODE='P0001';
    END IF;
    SELECT * INTO v_invoice FROM public.invoices WHERE id=p_invoice_id AND business_id=p_business_id;
    SELECT coalesce(sum(amount),0) INTO v_credit_total FROM public.invoice_credits WHERE invoice_id=p_invoice_id AND status='issued';
    RETURN jsonb_build_object('success',true,'already_recorded',true,'credit',to_jsonb(v_credit),
      'amountPaid',v_invoice.amount_paid,'creditTotal',v_credit_total,'balance',round(v_invoice.total-v_invoice.amount_paid-v_credit_total,2),'invoiceStatus',v_invoice.status);
  END IF;

  SELECT * INTO v_invoice FROM public.invoices WHERE id=p_invoice_id AND business_id=p_business_id FOR UPDATE;
  IF NOT FOUND OR v_invoice.status NOT IN ('issued','part_paid','overdue') THEN
    RAISE EXCEPTION 'Only an open issued invoice can receive a credit note.' USING ERRCODE='P0001';
  END IF;
  SELECT coalesce(sum(amount),0) INTO v_credit_total FROM public.invoice_credits
   WHERE invoice_id=p_invoice_id AND status='issued';
  IF p_amount>v_invoice.total-v_invoice.amount_paid-v_credit_total+0.005 THEN
    RAISE EXCEPTION 'Credit exceeds the outstanding invoice balance.' USING ERRCODE='22023';
  END IF;
  v_credit_total := round(v_credit_total+p_amount,2);
  v_amount_paid := v_invoice.amount_paid;
  v_status := CASE
    WHEN v_amount_paid+v_credit_total+0.005>=v_invoice.total THEN CASE WHEN v_amount_paid>0 THEN 'paid' ELSE 'credited' END
    WHEN v_invoice.due_date IS NOT NULL AND v_invoice.due_date<(v_now AT TIME ZONE 'Australia/Sydney')::date THEN 'overdue'
    WHEN v_amount_paid>0 THEN 'part_paid'
    ELSE 'issued' END;

  INSERT INTO public.invoice_credits
    (business_id,invoice_id,credit_number,amount,reason,status,idempotency_key,created_by,created_at)
  VALUES
    (p_business_id,p_invoice_id,'BRV-CN-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,10)),
     p_amount,left(trim(p_reason),1000),'issued',p_idempotency_key,p_actor_user_id,v_now)
  RETURNING * INTO v_credit;

  UPDATE public.invoices SET status=v_status,updated_at=v_now
   WHERE id=p_invoice_id AND business_id=p_business_id;

  IF v_status IN ('paid','credited') AND v_invoice.job_id IS NOT NULL THEN
    SELECT * INTO v_job FROM public.jobs WHERE id=v_invoice.job_id AND business_id=p_business_id;
    IF FOUND THEN
      IF v_job.appointment_id IS NOT NULL THEN
        SELECT enquiry_id INTO v_enquiry_id FROM public.appointments WHERE id=v_job.appointment_id AND business_id=p_business_id;
      END IF;
      IF v_enquiry_id IS NULL AND v_job.quote_id IS NOT NULL THEN
        SELECT enquiry_id INTO v_enquiry_id FROM public.quotes WHERE id=v_job.quote_id AND business_id=p_business_id;
      END IF;
      IF v_enquiry_id IS NOT NULL THEN
        SELECT * INTO v_enquiry FROM public.enquiries WHERE id=v_enquiry_id AND business_id=p_business_id FOR UPDATE;
        IF FOUND AND v_enquiry.request_type='quote_request' AND v_enquiry.archived_at IS NULL THEN
          UPDATE public.enquiries SET stage='closed',status='closed',archived_at=v_now,
            guest_access_token_hash=NULL,guest_access_expires_at=NULL,updated_at=v_now
           WHERE id=v_enquiry_id AND business_id=p_business_id;
          INSERT INTO public.enquiry_stage_history(business_id,enquiry_id,from_stage,to_stage,changed_by,note)
          VALUES(p_business_id,v_enquiry_id,v_enquiry.stage,'closed',p_actor_user_id,'Jobcard archived after full invoice settlement by credit note.');
        END IF;
      END IF;
    END IF;
  END IF;

  INSERT INTO public.audit_events(business_id,actor_user_id,action,entity_type,entity_id,details)
  VALUES(p_business_id,p_actor_user_id,'invoice.credit_issued','invoice_credit',v_credit.id,
    jsonb_build_object('invoice_id',p_invoice_id,'credit_number',v_credit.credit_number,'amount',p_amount,'reason',left(trim(p_reason),1000),'invoice_status',v_status));
  RETURN jsonb_build_object('success',true,'already_recorded',false,'credit',to_jsonb(v_credit),
    'amountPaid',v_amount_paid,'creditTotal',v_credit_total,'balance',round(v_invoice.total-v_amount_paid-v_credit_total,2),'invoiceStatus',v_status);
END;
$$;

CREATE OR REPLACE FUNCTION public.refresh_overdue_invoices(
  p_business_id uuid,
  p_actor_user_id uuid
) RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_invoice record;
  v_count integer := 0;
  v_credit_total numeric(12,2);
  v_now timestamptz := clock_timestamp();
BEGIN
  FOR v_invoice IN
    SELECT id,invoice_number,total,amount_paid,due_date
      FROM public.invoices
     WHERE business_id=p_business_id
       AND status IN ('issued','part_paid')
       AND due_date < (v_now AT TIME ZONE 'Australia/Sydney')::date
     FOR UPDATE
  LOOP
    SELECT coalesce(sum(amount),0) INTO v_credit_total
      FROM public.invoice_credits WHERE invoice_id=v_invoice.id AND status='issued';
    IF v_invoice.total-v_invoice.amount_paid-v_credit_total>0.005 THEN
      UPDATE public.invoices SET status='overdue',updated_at=v_now
       WHERE id=v_invoice.id AND business_id=p_business_id;
      INSERT INTO public.audit_events(business_id,actor_user_id,action,entity_type,entity_id,details)
      VALUES(p_business_id,p_actor_user_id,'invoice.marked_overdue','invoice',v_invoice.id,
        jsonb_build_object('invoice_number',v_invoice.invoice_number,'due_date',v_invoice.due_date));
      v_count:=v_count+1;
    END IF;
  END LOOP;
  RETURN v_count;
END;
$$;

-- Retire the non-idempotent payment entry point. All app writes use the keyed RPC.
REVOKE ALL ON FUNCTION public.record_invoice_payment(uuid,uuid,uuid,numeric,text,text) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.issue_invoice(uuid,uuid,uuid) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.record_invoice_payment_idempotent(uuid,uuid,uuid,numeric,text,text,text,uuid) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.record_invoice_refund(uuid,uuid,uuid,uuid,numeric,text,text,text,uuid) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.record_invoice_credit(uuid,uuid,uuid,numeric,text,uuid) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.refresh_overdue_invoices(uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.issue_invoice(uuid,uuid,uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.record_invoice_payment_idempotent(uuid,uuid,uuid,numeric,text,text,text,uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.record_invoice_refund(uuid,uuid,uuid,uuid,numeric,text,text,text,uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.record_invoice_credit(uuid,uuid,uuid,numeric,text,uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.refresh_overdue_invoices(uuid,uuid) TO service_role;
