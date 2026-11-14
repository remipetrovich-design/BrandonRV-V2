-- Create a draft invoice from a completed, senior-approved Workcard atomically.
-- The Workcard and its invoiceable entries are locked to prevent duplicate or stale invoices.
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
AS $function$
DECLARE
  v_job record;
  v_existing_invoice_id uuid;
  v_invoice record;
  v_entry record;
  v_item jsonb;
  v_source_entry_id uuid;
  v_source_entry_ids uuid[] := ARRAY[]::uuid[];
  v_item_count integer := 0;
  v_expected_item_count integer := 0;
  v_item_index integer := 0;
  v_line_total numeric(12,2);
  v_subtotal numeric(12,2) := 0;
  v_tax_numerator numeric := 0;
  v_tax_amount numeric(12,2);
  v_total numeric(12,2);
  v_requested_subtotal numeric(12,2);
  v_requested_tax_amount numeric(12,2);
  v_requested_total numeric(12,2);
  v_invoice_number text;
  v_due_date date;
  v_notes text;
  v_now timestamptz := pg_catalog.clock_timestamp();
BEGIN
  IF p_business_id IS NULL OR p_job_id IS NULL OR p_actor_user_id IS NULL
     OR pg_catalog.jsonb_typeof(p_invoice) IS DISTINCT FROM 'object'
     OR pg_catalog.jsonb_typeof(p_items) IS DISTINCT FROM 'array'
     OR pg_catalog.jsonb_array_length(p_items) < 1
     OR pg_catalog.jsonb_array_length(p_items) > 500 THEN
    RAISE EXCEPTION 'Invalid invoice creation details.' USING ERRCODE = '22023';
  END IF;

  SELECT j.id, j.business_id, j.customer_id, j.user_id, j.quote_id,
         j.job_number, j.status, j.senior_approval_status,
         j.customer_approval_status
    INTO v_job
    FROM public.jobs j
   WHERE j.id = p_job_id
     AND j.business_id = p_business_id
   FOR UPDATE;

  IF NOT FOUND OR v_job.status <> 'completed'
     OR v_job.senior_approval_status NOT IN ('approved', 'legacy_approved')
     OR v_job.customer_approval_status <> 'pending' THEN
    RAISE EXCEPTION 'Only a completed, senior-approved Workcard awaiting customer approval can receive a draft invoice.'
      USING ERRCODE = 'P0001';
  END IF;

  SELECT i.id
    INTO v_existing_invoice_id
    FROM public.invoices i
   WHERE i.business_id = p_business_id
     AND i.job_id = p_job_id
   LIMIT 1;

  IF FOUND THEN
    RAISE EXCEPTION 'This Workcard already has an invoice.'
      USING ERRCODE = 'P0001';
  END IF;

  -- Lock all eligible source entries before checking the supplied line list.
  PERFORM 1
    FROM public.job_work_entries e
   WHERE e.business_id = p_business_id
     AND e.job_id = p_job_id
     AND e.invoiceable = true
     AND e.entry_type IN ('labour', 'parts')
     AND e.quantity_used > 0
   ORDER BY e.created_at, e.id
   FOR UPDATE;

  SELECT pg_catalog.count(*)::integer
    INTO v_expected_item_count
    FROM public.job_work_entries e
   WHERE e.business_id = p_business_id
     AND e.job_id = p_job_id
     AND e.invoiceable = true
     AND e.entry_type IN ('labour', 'parts')
     AND e.quantity_used > 0;

  IF v_expected_item_count < 1
     OR pg_catalog.jsonb_array_length(p_items) <> v_expected_item_count THEN
    RAISE EXCEPTION 'Invoice lines must include every actual invoiceable Workcard entry exactly once.'
      USING ERRCODE = '22023';
  END IF;

  -- Calculate totals from locked database records. Client-supplied prices and totals
  -- are not trusted; the source_entry_id is used only to identify each actual entry.
  FOR v_item IN
    SELECT value FROM pg_catalog.jsonb_array_elements(p_items)
  LOOP
    IF pg_catalog.jsonb_typeof(v_item) IS DISTINCT FROM 'object'
       OR COALESCE(v_item ->> 'source_entry_id', '') = '' THEN
      RAISE EXCEPTION 'Each invoice line must identify its Workcard entry.'
        USING ERRCODE = '22023';
    END IF;

    BEGIN
      v_source_entry_id := (v_item ->> 'source_entry_id')::uuid;
    EXCEPTION WHEN OTHERS THEN
      RAISE EXCEPTION 'An invoice line contains an invalid Workcard entry reference.'
        USING ERRCODE = '22023';
    END;

    IF v_source_entry_id = ANY(v_source_entry_ids) THEN
      RAISE EXCEPTION 'A Workcard entry cannot appear more than once on an invoice.'
        USING ERRCODE = '22023';
    END IF;
    v_source_entry_ids := pg_catalog.array_append(v_source_entry_ids, v_source_entry_id);

    SELECT e.id, e.description, e.quantity_used, e.unit_price, e.tax_rate
      INTO v_entry
      FROM public.job_work_entries e
     WHERE e.id = v_source_entry_id
       AND e.business_id = p_business_id
       AND e.job_id = p_job_id
       AND e.invoiceable = true
       AND e.entry_type IN ('labour', 'parts')
       AND e.quantity_used > 0
     FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'An invoice line no longer matches an invoiceable Workcard entry.'
        USING ERRCODE = '22023';
    END IF;

    v_line_total := pg_catalog.round(v_entry.quantity_used * v_entry.unit_price, 2);
    v_subtotal := v_subtotal + v_line_total;
    v_tax_numerator := v_tax_numerator + (v_line_total * v_entry.tax_rate / 100);
    v_item_count := v_item_count + 1;
  END LOOP;

  v_subtotal := pg_catalog.round(v_subtotal, 2);
  v_tax_amount := pg_catalog.round(v_tax_numerator, 2);
  v_total := pg_catalog.round(v_subtotal + v_tax_amount, 2);

  BEGIN
    v_invoice_number := pg_catalog.btrim(p_invoice ->> 'invoice_number');
    v_requested_subtotal := (p_invoice ->> 'subtotal')::numeric;
    v_requested_tax_amount := (p_invoice ->> 'tax_amount')::numeric;
    v_requested_total := (p_invoice ->> 'total')::numeric;
    v_due_date := NULLIF(p_invoice ->> 'due_date', '')::date;
  EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION 'Invoice number, totals or due date are invalid.'
      USING ERRCODE = '22023';
  END;

  IF v_invoice_number IS NULL
     OR pg_catalog.length(v_invoice_number) < 5
     OR pg_catalog.length(v_invoice_number) > 50
     OR v_requested_subtotal IS NULL
     OR v_requested_tax_amount IS NULL
     OR v_requested_total IS NULL
     OR v_requested_subtotal < 0
     OR v_requested_tax_amount < 0
     OR v_requested_total <= 0
     OR v_total <= 0
     OR v_total > 10000000
     OR pg_catalog.abs(v_requested_subtotal - v_subtotal) > 0.005
     OR pg_catalog.abs(v_requested_tax_amount - v_tax_amount) > 0.005
     OR pg_catalog.abs(v_requested_total - v_total) > 0.005 THEN
    RAISE EXCEPTION 'Invoice totals do not match the actual Workcard entries.'
      USING ERRCODE = '22023';
  END IF;

  v_notes := NULLIF(pg_catalog.left(pg_catalog.btrim(COALESCE(p_invoice ->> 'notes', '')), 3000), '');

  INSERT INTO public.invoices (
    business_id, customer_id, user_id, job_id, quote_id,
    invoice_number, status, due_date, subtotal, tax_amount, total,
    amount_paid, notes, created_at, updated_at
  )
  VALUES (
    p_business_id, v_job.customer_id, v_job.user_id, v_job.id, v_job.quote_id,
    v_invoice_number, 'draft', v_due_date, v_subtotal, v_tax_amount, v_total,
    0, v_notes, v_now, v_now
  )
  RETURNING * INTO v_invoice;

  v_item_index := 0;
  FOR v_item IN
    SELECT value FROM pg_catalog.jsonb_array_elements(p_items)
  LOOP
    v_source_entry_id := (v_item ->> 'source_entry_id')::uuid;
    SELECT e.id, e.description, e.quantity_used, e.unit_price, e.tax_rate
      INTO v_entry
      FROM public.job_work_entries e
     WHERE e.id = v_source_entry_id
       AND e.business_id = p_business_id
       AND e.job_id = p_job_id
       AND e.invoiceable = true
       AND e.entry_type IN ('labour', 'parts')
       AND e.quantity_used > 0;

    INSERT INTO public.invoice_items (
      invoice_id, description, quantity, unit_price, tax_rate, line_total, sort_order
    )
    VALUES (
      v_invoice.id,
      v_entry.description,
      v_entry.quantity_used,
      v_entry.unit_price,
      v_entry.tax_rate,
      pg_catalog.round(v_entry.quantity_used * v_entry.unit_price, 2),
      v_item_index
    );
    v_item_index := v_item_index + 1;
  END LOOP;

  INSERT INTO public.audit_events (
    business_id, actor_user_id, action, entity_type, entity_id, details, created_at
  )
  VALUES (
    p_business_id, p_actor_user_id, 'invoice.draft_created_from_workcard',
    'invoice', v_invoice.id,
    pg_catalog.jsonb_build_object(
      'job_id', v_job.id,
      'job_number', v_job.job_number,
      'quote_id', v_job.quote_id,
      'item_count', v_item_count,
      'subtotal', v_subtotal,
      'tax_amount', v_tax_amount,
      'total', v_total
    ),
    v_now
  );

  RETURN pg_catalog.jsonb_build_object('invoice', pg_catalog.to_jsonb(v_invoice));
END;
$function$;

REVOKE ALL ON FUNCTION public.create_invoice_from_approved_workcard(uuid, uuid, uuid, jsonb, jsonb)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_invoice_from_approved_workcard(uuid, uuid, uuid, jsonb, jsonb)
  TO service_role;
