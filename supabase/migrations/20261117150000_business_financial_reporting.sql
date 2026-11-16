-- Aggregate business reports from the canonical commercial, procurement and Workcard records.
CREATE OR REPLACE FUNCTION public.business_financial_report(
  p_business_id uuid,
  p_from date,
  p_to date
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_result jsonb;
BEGIN
  IF p_business_id IS NULL OR p_from IS NULL OR p_to IS NULL OR p_to < p_from THEN
    RAISE EXCEPTION 'Choose a valid report date range.' USING ERRCODE = '22023';
  END IF;

  SELECT pg_catalog.jsonb_build_object(
    'from',p_from,
    'to',p_to,
    'summary',pg_catalog.jsonb_build_object(
      'invoiced',(
        SELECT pg_catalog.round(coalesce(sum(i.total),0),2)
          FROM public.invoices i
         WHERE i.business_id=p_business_id
           AND i.issue_date BETWEEN p_from AND p_to
           AND i.status NOT IN ('draft','void')
      ),
      'cash_received',(
        SELECT pg_catalog.round(coalesce(sum(p.amount),0),2)
          FROM public.payments p
         WHERE p.business_id=p_business_id
           AND p.status='recorded'
           AND p.paid_at IS NOT NULL
           AND (p.paid_at AT TIME ZONE 'Australia/Sydney')::date BETWEEN p_from AND p_to
      ),
      'outstanding',(
        SELECT pg_catalog.round(coalesce(sum(pg_catalog.greatest(i.total-i.amount_paid,0)),0),2)
          FROM public.invoices i
         WHERE i.business_id=p_business_id
           AND i.issue_date <= p_to
           AND i.status NOT IN ('draft','void')
           AND i.total > i.amount_paid
      ),
      'approved_expenses',(
        SELECT pg_catalog.round(coalesce(sum(e.total),0),2)
          FROM public.expenses e
         WHERE e.business_id=p_business_id
           AND e.expense_date BETWEEN p_from AND p_to
           AND e.approved_at IS NOT NULL
      ),
      'pending_expenses',(
        SELECT pg_catalog.round(coalesce(sum(e.total),0),2)
          FROM public.expenses e
         WHERE e.business_id=p_business_id
           AND e.expense_date BETWEEN p_from AND p_to
           AND e.approved_at IS NULL
      ),
      'supplier_commitments',(
        SELECT pg_catalog.round(coalesce(sum(s.total),0),2)
          FROM public.supplier_orders s
         WHERE s.business_id=p_business_id
           AND s.status IN ('ordered','part_received')
           AND (s.created_at AT TIME ZONE 'Australia/Sydney')::date BETWEEN p_from AND p_to
      ),
      'supplier_orders_received',(
        SELECT pg_catalog.round(coalesce(sum(s.total),0),2)
          FROM public.supplier_orders s
         WHERE s.business_id=p_business_id
           AND s.status='received'
           AND (s.received_at AT TIME ZONE 'Australia/Sydney')::date BETWEEN p_from AND p_to
      ),
      'completed_workcards',(
        SELECT count(*)
          FROM public.jobs j
         WHERE j.business_id=p_business_id
           AND j.status='completed'
           AND j.completed_at IS NOT NULL
           AND (j.completed_at AT TIME ZONE 'Australia/Sydney')::date BETWEEN p_from AND p_to
      ),
      'actual_hours',(
        SELECT pg_catalog.round(coalesce(sum(j.actual_hours),0),2)
          FROM public.jobs j
         WHERE j.business_id=p_business_id
           AND j.status='completed'
           AND j.completed_at IS NOT NULL
           AND (j.completed_at AT TIME ZONE 'Australia/Sydney')::date BETWEEN p_from AND p_to
      ),
      'new_quote_requests',(
        SELECT count(*)
          FROM public.enquiries e
         WHERE e.business_id=p_business_id
           AND e.request_type='quote_request'
           AND (e.created_at AT TIME ZONE 'Australia/Sydney')::date BETWEEN p_from AND p_to
      )
    ),
    'invoices',(
      SELECT coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'id',x.id,'invoice_number',x.invoice_number,'status',x.status,
        'issue_date',x.issue_date,'due_date',x.due_date,'total',x.total,'amount_paid',x.amount_paid
      ) ORDER BY x.issue_date DESC),'[]'::jsonb)
      FROM (
        SELECT i.id,i.invoice_number,i.status,i.issue_date,i.due_date,i.total,i.amount_paid
          FROM public.invoices i
         WHERE i.business_id=p_business_id
           AND i.issue_date BETWEEN p_from AND p_to
           AND i.status NOT IN ('draft','void')
         ORDER BY i.issue_date DESC
         LIMIT 50
      ) x
    ),
    'payments',(
      SELECT coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'id',x.id,'invoice_number',x.invoice_number,'amount',x.amount,
        'method',x.method,'paid_at',x.paid_at
      ) ORDER BY x.paid_at DESC),'[]'::jsonb)
      FROM (
        SELECT p.id,i.invoice_number,p.amount,p.method,p.paid_at
          FROM public.payments p
          LEFT JOIN public.invoices i ON i.id=p.invoice_id AND i.business_id=p_business_id
         WHERE p.business_id=p_business_id
           AND p.status='recorded'
           AND p.paid_at IS NOT NULL
           AND (p.paid_at AT TIME ZONE 'Australia/Sydney')::date BETWEEN p_from AND p_to
         ORDER BY p.paid_at DESC
         LIMIT 50
      ) x
    ),
    'expenses',(
      SELECT coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'id',x.id,'category',x.category,'description',x.description,'total',x.total,
        'expense_date',x.expense_date,'approved',x.approved_at IS NOT NULL,
        'supplier_order_id',x.supplier_order_id,'job_id',x.job_id
      ) ORDER BY x.expense_date DESC),'[]'::jsonb)
      FROM (
        SELECT e.id,e.category,e.description,e.total,e.expense_date,e.approved_at,e.supplier_order_id,e.job_id
          FROM public.expenses e
         WHERE e.business_id=p_business_id
           AND e.expense_date BETWEEN p_from AND p_to
         ORDER BY e.expense_date DESC
         LIMIT 50
      ) x
    ),
    'supplier_orders',(
      SELECT coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'id',x.id,'order_number',x.order_number,'status',x.status,'total',x.total,'created_at',x.created_at
      ) ORDER BY x.created_at DESC),'[]'::jsonb)
      FROM (
        SELECT s.id,s.order_number,s.status,s.total,s.created_at
          FROM public.supplier_orders s
         WHERE s.business_id=p_business_id
           AND s.status <> 'cancelled'
           AND (s.created_at AT TIME ZONE 'Australia/Sydney')::date BETWEEN p_from AND p_to
         ORDER BY s.created_at DESC
         LIMIT 50
      ) x
    ),
    'workcards',(
      SELECT coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'id',x.id,'job_number',x.job_number,'title',x.title,'actual_hours',x.actual_hours,'completed_at',x.completed_at
      ) ORDER BY x.completed_at DESC),'[]'::jsonb)
      FROM (
        SELECT j.id,j.job_number,j.title,j.actual_hours,j.completed_at
          FROM public.jobs j
         WHERE j.business_id=p_business_id
           AND j.status='completed'
           AND j.completed_at IS NOT NULL
           AND (j.completed_at AT TIME ZONE 'Australia/Sydney')::date BETWEEN p_from AND p_to
         ORDER BY j.completed_at DESC
         LIMIT 50
      ) x
    )
  )
  INTO v_result;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.business_financial_report(uuid,date,date) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.business_financial_report(uuid,date,date) TO service_role;
