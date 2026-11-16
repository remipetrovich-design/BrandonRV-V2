-- Link supplier purchasing to actual Workcard parts and receive quantities back into the Workcard.
ALTER TABLE public.supplier_order_items
  ADD COLUMN IF NOT EXISTS work_entry_id uuid REFERENCES public.job_work_entries(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS quantity_received numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS received_at timestamptz;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.supplier_order_items'::regclass
       AND conname = 'supplier_order_items_quantity_received_check'
  ) THEN
    ALTER TABLE public.supplier_order_items
      ADD CONSTRAINT supplier_order_items_quantity_received_check
      CHECK (quantity_received >= 0 AND quantity_received <= quantity);
  END IF;
END;
$$;

CREATE INDEX IF NOT EXISTS supplier_order_items_work_entry_idx
  ON public.supplier_order_items(work_entry_id) WHERE work_entry_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.sync_job_work_entry_procurement(
  p_business_id uuid,
  p_work_entry_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_ordered numeric(12,2);
  v_received numeric(12,2);
  v_supplier_name text;
  v_order_number text;
  v_ordered_at timestamptz;
  v_expected_at date;
  v_received_at timestamptz;
BEGIN
  SELECT coalesce(sum(oi.quantity),0), coalesce(sum(oi.quantity_received),0)
    INTO v_ordered, v_received
    FROM public.supplier_order_items oi
    JOIN public.supplier_orders so ON so.id = oi.order_id
   WHERE oi.work_entry_id = p_work_entry_id
     AND so.business_id = p_business_id
     AND so.status IN ('ordered','part_received','received');

  SELECT s.name, so.order_number, so.ordered_at, so.expected_at, so.received_at
    INTO v_supplier_name, v_order_number, v_ordered_at, v_expected_at, v_received_at
    FROM public.supplier_order_items oi
    JOIN public.supplier_orders so ON so.id = oi.order_id
    JOIN public.suppliers s ON s.id = so.supplier_id
   WHERE oi.work_entry_id = p_work_entry_id
     AND so.business_id = p_business_id
     AND so.status IN ('ordered','part_received','received')
   ORDER BY coalesce(so.ordered_at,so.created_at) DESC
   LIMIT 1;

  UPDATE public.job_work_entries
     SET quantity_ordered = v_ordered,
         quantity_received = v_received,
         part_order_status = CASE
           WHEN v_ordered = 0 THEN 'not_ordered'
           WHEN v_received >= v_ordered THEN 'received'
           WHEN v_received > 0 THEN 'part_received'
           ELSE 'ordered'
         END,
         supplier_name = v_supplier_name,
         supplier_order_reference = v_order_number,
         ordered_at = v_ordered_at,
         expected_at = v_expected_at,
         received_at = CASE WHEN v_ordered > 0 AND v_received >= v_ordered THEN coalesce(v_received_at,pg_catalog.clock_timestamp()) ELSE NULL END
   WHERE id = p_work_entry_id
     AND business_id = p_business_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.create_supplier_order(
  p_business_id uuid,
  p_actor_user_id uuid,
  p_supplier_id uuid,
  p_job_id uuid,
  p_expected_at date,
  p_notes text,
  p_items jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_supplier record;
  v_job record;
  v_order_id uuid := pg_catalog.gen_random_uuid();
  v_order_number text;
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_item jsonb;
  v_entry record;
  v_work_entry_id uuid;
  v_quantity numeric(12,2);
  v_unit_cost numeric(12,2);
  v_tax_rate numeric(6,2);
  v_line_total numeric(12,2);
  v_tax_total numeric(12,2);
  v_subtotal numeric(12,2) := 0;
  v_tax_amount numeric(12,2) := 0;
  v_count integer := 0;
  v_seen uuid[] := ARRAY[]::uuid[];
  v_description text;
  v_sku text;
BEGIN
  IF p_business_id IS NULL OR p_actor_user_id IS NULL OR p_supplier_id IS NULL OR p_items IS NULL
     OR pg_catalog.jsonb_typeof(p_items) <> 'array'
     OR pg_catalog.jsonb_array_length(p_items) < 1
     OR pg_catalog.jsonb_array_length(p_items) > 100 THEN
    RAISE EXCEPTION 'Choose a supplier and add between 1 and 100 order lines.' USING ERRCODE = '22023';
  END IF;

  SELECT id,name
    INTO v_supplier
    FROM public.suppliers
   WHERE id = p_supplier_id
     AND business_id = p_business_id
     AND is_active = true
   FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Select an active supplier from this business.' USING ERRCODE = 'P0001';
  END IF;

  IF p_job_id IS NOT NULL THEN
    SELECT id,status,worker_signed_off_at
      INTO v_job
      FROM public.jobs
     WHERE id = p_job_id
       AND business_id = p_business_id
     FOR UPDATE;
    IF NOT FOUND OR v_job.status IN ('completed','cancelled') OR v_job.worker_signed_off_at IS NOT NULL THEN
      RAISE EXCEPTION 'Supplier orders can only be linked to an open Workcard.' USING ERRCODE = 'P0001';
    END IF;
  END IF;

  v_order_number := 'PO-' || pg_catalog.to_char(v_now AT TIME ZONE 'Australia/Sydney','YYMMDD')
    || '-' || pg_catalog.upper(pg_catalog.substr(pg_catalog.replace(v_order_id::text,'-',''),1,6));

  INSERT INTO public.supplier_orders
    (id,business_id,supplier_id,job_id,order_number,status,expected_at,subtotal,tax_amount,total,notes,created_by,created_at,updated_at)
  VALUES
    (v_order_id,p_business_id,p_supplier_id,p_job_id,v_order_number,'draft',p_expected_at,0,0,0,
     NULLIF(pg_catalog.left(pg_catalog.btrim(coalesce(p_notes,'')),3000),''),p_actor_user_id,v_now,v_now);

  FOR v_item IN SELECT value FROM pg_catalog.jsonb_array_elements(p_items)
  LOOP
    v_count := v_count + 1;
    v_work_entry_id := NULLIF(v_item->>'work_entry_id','')::uuid;
    v_quantity := (v_item->>'quantity')::numeric;
    v_unit_cost := (v_item->>'unit_cost')::numeric;
    v_tax_rate := (v_item->>'tax_rate')::numeric;

    IF v_quantity IS NULL OR v_quantity <= 0 OR v_quantity > 10000
       OR v_unit_cost IS NULL OR v_unit_cost < 0 OR v_unit_cost > 10000000
       OR v_tax_rate IS NULL OR v_tax_rate < 0 OR v_tax_rate > 100 THEN
      RAISE EXCEPTION 'Order quantities, costs and tax rates must be valid.' USING ERRCODE = '22023';
    END IF;

    IF p_job_id IS NOT NULL AND v_work_entry_id IS NULL THEN
      RAISE EXCEPTION 'Every Workcard-linked order line must select an existing parts entry.' USING ERRCODE = '22023';
    END IF;
    IF p_job_id IS NULL AND v_work_entry_id IS NOT NULL THEN
      RAISE EXCEPTION 'A Workcard part cannot be ordered without its Workcard.' USING ERRCODE = '22023';
    END IF;

    v_description := pg_catalog.left(pg_catalog.btrim(coalesce(v_item->>'description','')),500);
    v_sku := NULLIF(pg_catalog.left(pg_catalog.btrim(coalesce(v_item->>'sku','')),100),'');

    IF v_work_entry_id IS NOT NULL THEN
      IF v_work_entry_id = ANY(v_seen) THEN
        RAISE EXCEPTION 'Each Workcard part can appear only once in an order.' USING ERRCODE = '22023';
      END IF;
      v_seen := pg_catalog.array_append(v_seen,v_work_entry_id);

      SELECT id,entry_type,description,part_number,quantity_required,quantity_ordered,job_id
        INTO v_entry
        FROM public.job_work_entries
       WHERE id = v_work_entry_id
         AND business_id = p_business_id
         AND job_id = p_job_id
       FOR UPDATE;

      IF NOT FOUND OR v_entry.entry_type <> 'parts' THEN
        RAISE EXCEPTION 'An order line must link to a parts entry on the selected Workcard.' USING ERRCODE = 'P0001';
      END IF;
      IF v_quantity > greatest(0,v_entry.quantity_required - v_entry.quantity_ordered) THEN
        RAISE EXCEPTION 'The order quantity exceeds the outstanding quantity required for %.',v_entry.description USING ERRCODE = '22023';
      END IF;
      v_description := v_entry.description;
      v_sku := coalesce(v_sku,v_entry.part_number);
    ELSIF v_description = '' THEN
      RAISE EXCEPTION 'Enter a description for every stock order line.' USING ERRCODE = '22023';
    END IF;

    v_line_total := pg_catalog.round(v_quantity * v_unit_cost,2);
    v_tax_total := pg_catalog.round(v_line_total * v_tax_rate / 100,2);
    v_subtotal := v_subtotal + v_line_total;
    v_tax_amount := v_tax_amount + v_tax_total;

    INSERT INTO public.supplier_order_items
      (order_id,work_entry_id,description,sku,quantity,unit_cost,tax_rate,line_total,quantity_received)
    VALUES
      (v_order_id,v_work_entry_id,v_description,v_sku,v_quantity,v_unit_cost,v_tax_rate,v_line_total,0);
  END LOOP;

  UPDATE public.supplier_orders
     SET subtotal = pg_catalog.round(v_subtotal,2),
         tax_amount = pg_catalog.round(v_tax_amount,2),
         total = pg_catalog.round(v_subtotal + v_tax_amount,2),
         updated_at = v_now
   WHERE id = v_order_id
     AND business_id = p_business_id;

  INSERT INTO public.audit_events
    (business_id,actor_user_id,action,entity_type,entity_id,details)
  VALUES
    (p_business_id,p_actor_user_id,'supplier_order.created','supplier_order',v_order_id,
     pg_catalog.jsonb_build_object('order_number',v_order_number,'supplier_id',p_supplier_id,
       'job_id',p_job_id,'line_count',v_count,'subtotal',v_subtotal,'tax_amount',v_tax_amount,'total',v_subtotal+v_tax_amount));

  RETURN pg_catalog.jsonb_build_object('success',true,'order',
    pg_catalog.jsonb_build_object('id',v_order_id,'order_number',v_order_number,'status','draft',
      'supplier_name',v_supplier.name,'job_id',p_job_id,'subtotal',v_subtotal,'tax_amount',v_tax_amount,'total',v_subtotal+v_tax_amount));
END;
$$;

CREATE OR REPLACE FUNCTION public.transition_supplier_order(
  p_business_id uuid,
  p_order_id uuid,
  p_actor_user_id uuid,
  p_next_status text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_order record;
  v_item record;
  v_entry record;
  v_now timestamptz := pg_catalog.clock_timestamp();
BEGIN
  IF p_next_status IS NULL OR p_next_status NOT IN ('ordered','cancelled') THEN
    RAISE EXCEPTION 'Choose a valid supplier order action.' USING ERRCODE = '22023';
  END IF;

  SELECT id,status,order_number
    INTO v_order
    FROM public.supplier_orders
   WHERE id = p_order_id
     AND business_id = p_business_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Supplier order not found.' USING ERRCODE = 'P0002';
  END IF;

  IF p_next_status = 'ordered' THEN
    IF v_order.status = 'ordered' THEN
      RETURN pg_catalog.jsonb_build_object('success',true,'status','ordered');
    END IF;
    IF v_order.status <> 'draft' THEN
      RAISE EXCEPTION 'Only a draft supplier order can be marked ordered.' USING ERRCODE = 'P0001';
    END IF;

    FOR v_item IN
      SELECT id,work_entry_id,quantity
        FROM public.supplier_order_items
       WHERE order_id = p_order_id
       ORDER BY id
    LOOP
      IF v_item.work_entry_id IS NOT NULL THEN
        SELECT id,entry_type,quantity_required,quantity_ordered,job_id,status
          INTO v_entry
          FROM public.job_work_entries e
          JOIN public.jobs j ON j.id = e.job_id
         WHERE e.id = v_item.work_entry_id
           AND e.business_id = p_business_id
           AND j.business_id = p_business_id
         FOR UPDATE OF e,j;
        IF NOT FOUND OR v_entry.entry_type <> 'parts' OR v_entry.status IN ('completed','cancelled')
           OR v_entry.quantity_ordered + v_item.quantity > v_entry.quantity_required THEN
          RAISE EXCEPTION 'A Workcard part has changed or no longer has enough outstanding quantity. Review the draft order.' USING ERRCODE = 'P0001';
        END IF;
      END IF;
    END LOOP;

    UPDATE public.supplier_orders
       SET status = 'ordered', ordered_at = v_now, updated_at = v_now
     WHERE id = p_order_id AND business_id = p_business_id;

    FOR v_item IN
      SELECT DISTINCT work_entry_id
        FROM public.supplier_order_items
       WHERE order_id = p_order_id AND work_entry_id IS NOT NULL
    LOOP
      PERFORM public.sync_job_work_entry_procurement(p_business_id,v_item.work_entry_id);
    END LOOP;
  ELSE
    IF v_order.status = 'cancelled' THEN
      RETURN pg_catalog.jsonb_build_object('success',true,'status','cancelled');
    END IF;
    IF v_order.status NOT IN ('draft','ordered')
       OR EXISTS (SELECT 1 FROM public.supplier_order_items WHERE order_id=p_order_id AND quantity_received > 0) THEN
      RAISE EXCEPTION 'An order can only be cancelled before any goods are received.' USING ERRCODE = 'P0001';
    END IF;

    UPDATE public.supplier_orders
       SET status = 'cancelled', updated_at = v_now
     WHERE id = p_order_id AND business_id = p_business_id;

    FOR v_item IN
      SELECT DISTINCT work_entry_id
        FROM public.supplier_order_items
       WHERE order_id = p_order_id AND work_entry_id IS NOT NULL
    LOOP
      PERFORM public.sync_job_work_entry_procurement(p_business_id,v_item.work_entry_id);
    END LOOP;
  END IF;

  INSERT INTO public.audit_events
    (business_id,actor_user_id,action,entity_type,entity_id,details)
  VALUES
    (p_business_id,p_actor_user_id,'supplier_order.'||p_next_status,'supplier_order',p_order_id,
     pg_catalog.jsonb_build_object('order_number',v_order.order_number,'status',p_next_status));

  RETURN pg_catalog.jsonb_build_object('success',true,'status',p_next_status);
END;
$$;

CREATE OR REPLACE FUNCTION public.receive_supplier_order_item(
  p_business_id uuid,
  p_order_id uuid,
  p_item_id uuid,
  p_actor_user_id uuid,
  p_quantity numeric
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_order record;
  v_item record;
  v_next_status text;
  v_now timestamptz := pg_catalog.clock_timestamp();
BEGIN
  IF p_quantity IS NULL OR p_quantity <= 0 OR p_quantity > 10000 THEN
    RAISE EXCEPTION 'Enter a valid received quantity.' USING ERRCODE = '22023';
  END IF;

  SELECT id,status,order_number
    INTO v_order
    FROM public.supplier_orders
   WHERE id = p_order_id AND business_id = p_business_id
   FOR UPDATE;
  IF NOT FOUND OR v_order.status NOT IN ('ordered','part_received') THEN
    RAISE EXCEPTION 'Only an ordered supplier order can receive goods.' USING ERRCODE = 'P0001';
  END IF;

  SELECT id,work_entry_id,quantity,quantity_received
    INTO v_item
    FROM public.supplier_order_items
   WHERE id = p_item_id AND order_id = p_order_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Supplier order line not found.' USING ERRCODE = 'P0002';
  END IF;
  IF p_quantity > v_item.quantity - v_item.quantity_received THEN
    RAISE EXCEPTION 'Received quantity exceeds the outstanding order quantity.' USING ERRCODE = '22023';
  END IF;

  UPDATE public.supplier_order_items
     SET quantity_received = quantity_received + p_quantity,
         received_at = CASE WHEN quantity_received + p_quantity >= quantity THEN v_now ELSE received_at END
   WHERE id = p_item_id AND order_id = p_order_id;

  SELECT CASE
    WHEN bool_and(quantity_received >= quantity) THEN 'received'
    WHEN bool_or(quantity_received > 0) THEN 'part_received'
    ELSE 'ordered'
  END
    INTO v_next_status
    FROM public.supplier_order_items
   WHERE order_id = p_order_id;

  UPDATE public.supplier_orders
     SET status = v_next_status,
         received_at = CASE WHEN v_next_status = 'received' THEN v_now ELSE NULL END,
         updated_at = v_now
   WHERE id = p_order_id AND business_id = p_business_id;

  IF v_item.work_entry_id IS NOT NULL THEN
    PERFORM public.sync_job_work_entry_procurement(p_business_id,v_item.work_entry_id);
  END IF;

  INSERT INTO public.audit_events
    (business_id,actor_user_id,action,entity_type,entity_id,details)
  VALUES
    (p_business_id,p_actor_user_id,'supplier_order.goods_received','supplier_order_item',p_item_id,
     pg_catalog.jsonb_build_object('order_id',p_order_id,'order_number',v_order.order_number,'quantity_received',p_quantity));

  RETURN pg_catalog.jsonb_build_object('success',true,'status',v_next_status,'quantity_received',v_item.quantity_received+p_quantity);
END;
$$;

REVOKE ALL ON FUNCTION public.sync_job_work_entry_procurement(uuid,uuid) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.create_supplier_order(uuid,uuid,uuid,uuid,date,text,jsonb) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.transition_supplier_order(uuid,uuid,uuid,text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.receive_supplier_order_item(uuid,uuid,uuid,uuid,numeric) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.sync_job_work_entry_procurement(uuid,uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.create_supplier_order(uuid,uuid,uuid,uuid,date,text,jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.transition_supplier_order(uuid,uuid,uuid,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.receive_supplier_order_item(uuid,uuid,uuid,uuid,numeric) TO service_role;
