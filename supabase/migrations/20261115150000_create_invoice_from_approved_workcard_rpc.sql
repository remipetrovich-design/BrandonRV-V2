-- Create the final draft invoice from approved actual Workcard entries in one transaction.
-- The draft is required before the customer can approve the final Workcard report.
CREATE OR REPLACE FUNCTION public.create_invoice_from_approved_workcard(
  p_business_id uuid,
  p_job_id uuid,
  p_actor_user_id uuid,
  p_invoice jsonb,
  p_items jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_job record;
  v_invoice_id uuid;
  v_invoice_number text;
  v_due_date date;
  v_notes text;
  v_subtotal numeric(12,2);
  v_tax_amount numeric(12,2);
  v_total numeric(12,2);
  v_expected_subtotal numeric(12,2) := 0;
  v_expected_tax_cents numeric(18,0) := 0;
  v_expected_total numeric(12,2);
  v_item jsonb;
  v_entry record;
  v_item_count integer := 0;
  v_entry_count integer := 0;
  v_seen_ids uuid[] := ARRAY[]::uuid[];
  v_source_id uuid;
  v_quantity numeric;
  v_unit_price numeric;
  v_tax_rate numeric;
  v_line_total numeric;
  v_sort_order integer;
BEGIN
  IF p_business_id IS NULL OR p_job_id IS NULL OR p_actor_user_id IS NULL
     OR jsonb_typeof(p_invoice) <> 'object'
     OR jsonb_typeof(p_items) <> 'array'
     OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'Invalid invoice details.' USING ERRCODE = '22023';
  END IF;

  SELECT j.id,j.customer_id,j.user_id,j.quote_id,j.job_number,j.status,
         j.senior_approval_status,j.customer_approval_status
    INTO v_job
    FROM public.jobs j
   WHERE j.id = p_job_id AND j.business_id = p_business_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Workcard not found.' USING ERRCODE = 'P0002';
  END IF;
  IF v_job.status <> 'completed'
     OR v_job.senior_approval_status NOT IN ('approved','legacy_approved')
     OR v_job.customer_approval_status <> 'pending' THEN
    RAISE EXCEPTION 'Senior-approved completed Workcard awaiting customer approval is required before creating the draft invoice.'
      USING ERRCODE = 'P0001';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.invoices i
     WHERE i.business_id = p_business_id AND i.job_id = p_job_id
  ) THEN
    RAISE EXCEPTION 'This Workcard already has an invoice.' USING ERRCODE = 'P0001';
  END IF;

  v_invoice_number := left(trim(coalesce(p_invoice->>'invoice_number','')),80);
  IF v_invoice_number = '' THEN
    RAISE EXCEPTION 'Invoice number is required.' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (SELECT 1 FROM public.invoices i WHERE i.business_id=p_business_id AND i.invoice_number=v_invoice_number) THEN
    RAISE EXCEPTION 'Invoice number is already in use.' USING ERRCODE = '23505';
  END IF;

  v_due_date := NULLIF(p_invoice->>'due_date','')::date;
  v_notes := NULLIF(left(trim(coalesce(p_invoice->>'notes','')),3000),'');
  v_subtotal := (p_invoice->>'subtotal')::numeric;
  v_tax_amount := (p_invoice->>'tax_amount')::numeric;
  v_total := (p_invoice->>'total')::numeric;
  IF v_subtotal IS NULL OR v_tax_amount IS NULL OR v_total IS NULL
     OR v_subtotal < 0 OR v_tax_amount < 0 OR v_total <= 0
     OR v_subtotal > 10000000 OR v_tax_amount > 10000000 OR v_total > 10000000 THEN
    RAISE EXCEPTION 'Invoice totals are invalid.' USING ERRCODE = '22023';
  END IF;

  SELECT count(*)::integer INTO v_entry_count
    FROM public.job_work_entries e
   WHERE e.business_id=p_business_id AND e.job_id=p_job_id
     AND e.invoiceable=true AND e.quantity_used>0
     AND e.entry_type IN ('labour','parts');

  FOR v_item IN SELECT value FROM pg_catalog.jsonb_array_elements(p_items)
  LOOP
    v_item_count := v_item_count + 1;
    v_source_id := (v_item->>'source_entry_id')::uuid;
    IF v_source_id IS NULL OR v_source_id = ANY(v_seen_ids) THEN
      RAISE EXCEPTION 'Invoice lines must reference each actual Workcard entry exactly once.' USING ERRCODE = '22023';
    END IF;
    v_seen_ids := pg_catalog.array_append(v_seen_ids,v_source_id);

    SELECT e.id,e.entry_type,e.description,e.quantity_used,e.unit_price,e.tax_rate,e.invoiceable
      INTO v_entry
      FROM public.job_work_entries e
     WHERE e.id=v_source_id AND e.business_id=p_business_id AND e.job_id=p_job_id
       AND e.invoiceable=true AND e.quantity_used>0
       AND e.entry_type IN ('labour','parts')
     FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'An actual Workcard entry changed or is no longer invoiceable.' USING ERRCODE = 'P0001';
    END IF;

    v_quantity := (v_item->>'quantity')::numeric;
    v_unit_price := (v_item->>'unit_price')::numeric;
    v_tax_rate := (v_item->>'tax_rate')::numeric;
    v_line_total := (v_item->>'line_total')::numeric;
    v_sort_order := coalesce((v_item->>'sort_order')::integer,v_item_count-1);
    IF v_item->>'description' IS DISTINCT FROM v_entry.description
       OR v_quantity IS DISTINCT FROM v_entry.quantity_used
       OR v_unit_price IS DISTINCT FROM v_entry.unit_price
       OR v_tax_rate IS DISTINCT FROM v_entry.tax_rate
       OR v_tax_rate < 0 OR v_tax_rate > 100
       OR v_line_total IS DISTINCT FROM round(v_quantity*v_unit_price,2)
       OR v_sort_order < 0 THEN
      RAISE EXCEPTION 'Invoice lines no longer match the approved actual Workcard entries.' USING ERRCODE = 'P0001';
    END IF;

    v_expected_subtotal := v_expected_subtotal + v_line_total;
    v_expected_tax_cents := v_expected_tax_cents
      + round(v_line_total*100) * round(v_tax_rate*100);
  END LOOP;

  IF v_item_count <> v_entry_count OR cardinality(v_seen_ids) <> v_entry_count THEN
    RAISE EXCEPTION 'The invoice must include every actual Workcard entry marked invoiceable.' USING ERRCODE = 'P0001';
  END IF;

  v_expected_subtotal := round(v_expected_subtotal,2);
  v_expected_tax_cents := round(v_expected_tax_cents/10000);
  v_expected_total := round(v_expected_subtotal + v_expected_tax_cents/100,2);
  IF v_subtotal <> v_expected_subtotal
     OR v_tax_amount <> v_expected_tax_cents/100
     OR v_total <> v_expected_total THEN
    RAISE EXCEPTION 'Invoice totals do not match the actual Workcard entries.' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.invoices
    (business_id,customer_id,user_id,job_id,quote_id,invoice_number,status,due_date,subtotal,tax_amount,total,amount_paid,notes)
  VALUES
    (p_business_id,v_job.customer_id,v_job.user_id,v_job.id,v_job.quote_id,v_invoice_number,
     'draft',v_due_date,v_subtotal,v_tax_amount,v_total,0,v_notes)
  RETURNING id INTO v_invoice_id;

  INSERT INTO public.invoice_items (invoice_id,description,quantity,unit_price,tax_rate,line_total,sort_order)
  SELECT v_invoice_id,
         item->>'description',
         (item->>'quantity')::numeric,
         (item->>'unit_price')::numeric,
         (item->>'tax_rate')::numeric,
         (item->>'line_total')::numeric,
         coalesce((item->>'sort_order')::integer,ordinality::integer-1)
    FROM pg_catalog.jsonb_array_elements(p_items) WITH ORDINALITY AS source(item,ordinality);

  INSERT INTO public.audit_events
    (business_id,actor_user_id,action,entity_type,entity_id,details)
  VALUES
    (p_business_id,p_actor_user_id,'invoice.draft_created_from_actual_work','invoice',v_invoice_id,
     pg_catalog.jsonb_build_object('invoice_number',v_invoice_number,'job_id',v_job.id,
       'job_number',v_job.job_number,'source_entry_ids',v_seen_ids,
       'subtotal',v_subtotal,'tax_amount',v_tax_amount,'total',v_total));

  RETURN pg_catalog.jsonb_build_object('success',true,'invoice',
    pg_catalog.jsonb_build_object('id',v_invoice_id,'invoice_number',v_invoice_number,'total',v_total,'status','draft'));
END;
$$;

REVOKE ALL ON FUNCTION public.create_invoice_from_approved_workcard(uuid,uuid,uuid,jsonb,jsonb)
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.create_invoice_from_approved_workcard(uuid,uuid,uuid,jsonb,jsonb)
  TO service_role;
