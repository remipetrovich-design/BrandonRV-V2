-- Connect real supplier purchases and Workcard costs to the existing expense ledger.
ALTER TABLE public.expenses
  ADD COLUMN IF NOT EXISTS supplier_order_id uuid
  REFERENCES public.supplier_orders(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS expenses_supplier_order_idx
  ON public.expenses(supplier_order_id) WHERE supplier_order_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.create_expense(
  p_business_id uuid,
  p_actor_user_id uuid,
  p_job_id uuid,
  p_supplier_id uuid,
  p_supplier_order_id uuid,
  p_category text,
  p_description text,
  p_amount_ex_tax numeric,
  p_tax_amount numeric,
  p_total numeric,
  p_expense_date date
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_job_id uuid := p_job_id;
  v_supplier_id uuid := p_supplier_id;
  v_order record;
  v_expense record;
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_amount numeric(12,2);
  v_tax numeric(12,2);
  v_total numeric(12,2);
BEGIN
  IF p_business_id IS NULL OR p_actor_user_id IS NULL
     OR length(trim(coalesce(p_category,''))) < 2
     OR length(trim(coalesce(p_category,''))) > 80
     OR length(trim(coalesce(p_description,''))) < 3
     OR length(trim(coalesce(p_description,''))) > 500
     OR p_expense_date IS NULL THEN
    RAISE EXCEPTION 'Enter a category, description and valid expense date.' USING ERRCODE = '22023';
  END IF;

  IF p_amount_ex_tax IS NULL OR p_tax_amount IS NULL OR p_total IS NULL
     OR p_amount_ex_tax < 0 OR p_tax_amount < 0
     OR p_amount_ex_tax > 10000000 OR p_tax_amount > 10000000 THEN
    RAISE EXCEPTION 'Enter valid expense amounts.' USING ERRCODE = '22023';
  END IF;

  v_amount := pg_catalog.round(p_amount_ex_tax,2);
  v_tax := pg_catalog.round(p_tax_amount,2);
  v_total := pg_catalog.round(p_total,2);
  IF v_total <= 0 OR abs(v_total - (v_amount + v_tax)) > 0.005 THEN
    RAISE EXCEPTION 'The expense total must equal the ex-tax amount plus tax.' USING ERRCODE = '22023';
  END IF;

  IF v_job_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.jobs WHERE id = v_job_id AND business_id = p_business_id
  ) THEN
    RAISE EXCEPTION 'The selected Workcard does not belong to this business.' USING ERRCODE = 'P0001';
  END IF;

  IF v_supplier_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.suppliers WHERE id = v_supplier_id AND business_id = p_business_id
  ) THEN
    RAISE EXCEPTION 'The selected supplier does not belong to this business.' USING ERRCODE = 'P0001';
  END IF;

  IF p_supplier_order_id IS NOT NULL THEN
    SELECT id,supplier_id,job_id,status
      INTO v_order
      FROM public.supplier_orders
     WHERE id = p_supplier_order_id AND business_id = p_business_id
     FOR UPDATE;
    IF NOT FOUND OR v_order.status NOT IN ('ordered','part_received','received') THEN
      RAISE EXCEPTION 'Select an active supplier order from this business.' USING ERRCODE = 'P0001';
    END IF;
    IF v_supplier_id IS NOT NULL AND v_supplier_id IS DISTINCT FROM v_order.supplier_id THEN
      RAISE EXCEPTION 'The selected supplier does not match the supplier order.' USING ERRCODE = '22023';
    END IF;
    IF v_job_id IS NOT NULL AND v_order.job_id IS NOT NULL AND v_job_id IS DISTINCT FROM v_order.job_id THEN
      RAISE EXCEPTION 'The selected Workcard does not match the supplier order.' USING ERRCODE = '22023';
    END IF;
    v_supplier_id := v_order.supplier_id;
    v_job_id := coalesce(v_job_id,v_order.job_id);
  END IF;

  IF v_job_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.jobs WHERE id = v_job_id AND business_id = p_business_id
  ) THEN
    RAISE EXCEPTION 'The supplier order Workcard does not belong to this business.' USING ERRCODE = 'P0001';
  END IF;

  IF v_supplier_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.suppliers WHERE id = v_supplier_id AND business_id = p_business_id
  ) THEN
    RAISE EXCEPTION 'The supplier order supplier does not belong to this business.' USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO public.expenses
    (business_id,job_id,supplier_id,supplier_order_id,category,description,
     amount_ex_tax,tax_amount,total,expense_date,entered_by)
  VALUES
    (p_business_id,v_job_id,v_supplier_id,p_supplier_order_id,
     trim(p_category),trim(p_description),v_amount,v_tax,v_total,p_expense_date,p_actor_user_id)
  RETURNING id,category,description,amount_ex_tax,tax_amount,total,expense_date,supplier_order_id
    INTO v_expense;

  INSERT INTO public.audit_events
    (business_id,actor_user_id,action,entity_type,entity_id,details)
  VALUES
    (p_business_id,p_actor_user_id,'expense.created','expense',v_expense.id,
     pg_catalog.jsonb_build_object('category',v_expense.category,'total',v_expense.total,
       'job_id',v_job_id,'supplier_id',v_supplier_id,'supplier_order_id',p_supplier_order_id));

  RETURN pg_catalog.jsonb_build_object('success',true,'expense',pg_catalog.to_jsonb(v_expense));
END;
$$;

CREATE OR REPLACE FUNCTION public.review_expense(
  p_business_id uuid,
  p_expense_id uuid,
  p_actor_user_id uuid,
  p_approved boolean
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_expense record;
  v_now timestamptz := pg_catalog.clock_timestamp();
BEGIN
  IF p_business_id IS NULL OR p_expense_id IS NULL OR p_actor_user_id IS NULL OR p_approved IS NULL THEN
    RAISE EXCEPTION 'Choose an expense and an approval decision.' USING ERRCODE = '22023';
  END IF;

  SELECT id,approved_at,approved_by,total
    INTO v_expense
    FROM public.expenses
   WHERE id = p_expense_id AND business_id = p_business_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Expense not found.' USING ERRCODE = 'P0002';
  END IF;
  IF v_expense.total <= 0 THEN
    RAISE EXCEPTION 'An expense must have a positive total before approval.' USING ERRCODE = 'P0001';
  END IF;

  IF (v_expense.approved_at IS NOT NULL) = p_approved THEN
    RETURN pg_catalog.jsonb_build_object('success',true,'approved',p_approved,'expense_id',p_expense_id);
  END IF;

  UPDATE public.expenses
     SET approved_at = CASE WHEN p_approved THEN v_now ELSE NULL END,
         approved_by = CASE WHEN p_approved THEN p_actor_user_id ELSE NULL END
   WHERE id = p_expense_id AND business_id = p_business_id;

  INSERT INTO public.audit_events
    (business_id,actor_user_id,action,entity_type,entity_id,details)
  VALUES
    (p_business_id,p_actor_user_id,
     CASE WHEN p_approved THEN 'expense.approved' ELSE 'expense.approval_revoked' END,
     'expense',p_expense_id,
     pg_catalog.jsonb_build_object('total',v_expense.total));

  RETURN pg_catalog.jsonb_build_object('success',true,'approved',p_approved,'expense_id',p_expense_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.set_expense_receipt_path(
  p_business_id uuid,
  p_expense_id uuid,
  p_actor_user_id uuid,
  p_storage_path text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_previous_path text;
BEGIN
  IF p_business_id IS NULL OR p_expense_id IS NULL OR p_actor_user_id IS NULL
     OR p_storage_path IS NULL
     OR p_storage_path NOT LIKE p_business_id::text || '/expenses/' || p_expense_id::text || '/%' THEN
    RAISE EXCEPTION 'Invalid receipt location.' USING ERRCODE = '22023';
  END IF;

  SELECT receipt_storage_path INTO v_previous_path
    FROM public.expenses
   WHERE id = p_expense_id AND business_id = p_business_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Expense not found.' USING ERRCODE = 'P0002';
  END IF;

  UPDATE public.expenses
     SET receipt_storage_path = p_storage_path
   WHERE id = p_expense_id AND business_id = p_business_id;

  INSERT INTO public.audit_events
    (business_id,actor_user_id,action,entity_type,entity_id,details)
  VALUES
    (p_business_id,p_actor_user_id,'expense.receipt_attached','expense',p_expense_id,
     pg_catalog.jsonb_build_object('previous_path_present',v_previous_path IS NOT NULL));

  RETURN pg_catalog.jsonb_build_object('success',true);
END;
$$;

REVOKE ALL ON FUNCTION public.create_expense(uuid,uuid,uuid,uuid,uuid,text,text,numeric,numeric,numeric,date) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.review_expense(uuid,uuid,uuid,boolean) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.set_expense_receipt_path(uuid,uuid,uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.create_expense(uuid,uuid,uuid,uuid,uuid,text,text,numeric,numeric,numeric,date) TO service_role;
GRANT EXECUTE ON FUNCTION public.review_expense(uuid,uuid,uuid,boolean) TO service_role;
GRANT EXECUTE ON FUNCTION public.set_expense_receipt_path(uuid,uuid,uuid,text) TO service_role;
