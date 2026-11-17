-- Quote review and issue must handle both standard quotes and Workcard variations.
CREATE OR REPLACE FUNCTION public.review_quote(
  p_quote_id uuid,
  p_business_id uuid,
  p_actor_user_id uuid,
  p_decision text,
  p_note text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_quote record;
  v_now timestamptz := clock_timestamp();
BEGIN
  IF p_decision NOT IN ('approved','changes_requested') THEN
    RAISE EXCEPTION 'Choose approve or request changes.' USING ERRCODE = '22023';
  END IF;
  IF p_decision = 'changes_requested' AND length(trim(coalesce(p_note,''))) < 5 THEN
    RAISE EXCEPTION 'Describe the quote changes required.' USING ERRCODE = '22023';
  END IF;

  SELECT id, status, senior_approval_status, prepared_by, enquiry_id, quote_kind, job_id
    INTO v_quote
    FROM public.quotes
   WHERE id = p_quote_id
     AND business_id = p_business_id
   FOR UPDATE;

  IF NOT FOUND OR v_quote.status <> 'draft' OR v_quote.senior_approval_status <> 'pending' THEN
    RAISE EXCEPTION 'This quote is not awaiting senior review.' USING ERRCODE = 'P0001';
  END IF;
  IF v_quote.prepared_by IS NOT NULL AND v_quote.prepared_by = p_actor_user_id THEN
    RAISE EXCEPTION 'A different authorised senior staff member must review this quote.' USING ERRCODE = 'P0001';
  END IF;

  IF coalesce(v_quote.quote_kind,'standard') = 'variation' THEN
    IF v_quote.job_id IS NULL OR NOT EXISTS (
      SELECT 1 FROM public.jobs j
       WHERE j.id = v_quote.job_id
         AND j.business_id = p_business_id
         AND j.status IN ('pending','scheduled','in_progress','waiting_parts')
         AND j.worker_signed_off_at IS NULL
         AND j.workcard_review_status IN ('approved','legacy_approved')
    ) THEN
      RAISE EXCEPTION 'This Workcard is not available for variation review.' USING ERRCODE = 'P0001';
    END IF;
  ELSE
    IF v_quote.enquiry_id IS NULL OR NOT EXISTS (
      SELECT 1 FROM public.enquiries e
       WHERE e.id = v_quote.enquiry_id
         AND e.business_id = p_business_id
         AND e.request_type = 'quote_request'
         AND e.archived_at IS NULL
         AND e.status IN ('new','reviewing','quoted')
    ) THEN
      RAISE EXCEPTION 'This quote is not attached to an active Quote Request Jobcard.' USING ERRCODE = 'P0001';
    END IF;
  END IF;

  UPDATE public.quotes
     SET senior_approval_status = p_decision,
         senior_approved_by = CASE WHEN p_decision = 'approved' THEN p_actor_user_id ELSE NULL END,
         senior_approved_at = CASE WHEN p_decision = 'approved' THEN v_now ELSE NULL END,
         senior_approval_note = NULLIF(left(trim(coalesce(p_note,'')),2000),''),
         updated_at = v_now
   WHERE id = p_quote_id
     AND business_id = p_business_id;

  INSERT INTO public.audit_events
    (business_id, actor_user_id, action, entity_type, entity_id, details)
  VALUES
    (p_business_id, p_actor_user_id,
     CASE WHEN coalesce(v_quote.quote_kind,'standard')='variation' THEN CASE WHEN p_decision='approved' THEN 'workcard.variation_senior_approved' ELSE 'workcard.variation_returned_for_revision' END WHEN p_decision='approved' THEN 'quote.senior_approved' ELSE 'quote.returned_for_revision' END,
     'quote', p_quote_id,
     jsonb_build_object('decision',p_decision,'note',NULLIF(left(trim(coalesce(p_note,'')),2000),''),'reviewed_at',v_now));

  RETURN jsonb_build_object('success',true,'decision',p_decision,'reviewed_at',v_now);
END;
$function$;

REVOKE ALL ON FUNCTION public.review_quote(uuid, uuid, uuid, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.review_quote(uuid, uuid, uuid, text, text) TO service_role;

CREATE OR REPLACE FUNCTION public.issue_quote_for_jobcard(
  p_quote_id uuid,
  p_business_id uuid,
  p_actor_user_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_quote record;
  v_enquiry record;
  v_now timestamptz := clock_timestamp();
BEGIN
  SELECT id, business_id, enquiry_id, quote_number, status, total, revision_number, senior_approval_status
    INTO v_quote
    FROM public.quotes
   WHERE id = p_quote_id
     AND business_id = p_business_id
   FOR UPDATE;

  IF NOT FOUND OR v_quote.status <> 'draft' OR v_quote.enquiry_id IS NULL
     OR v_quote.senior_approval_status NOT IN ('approved','legacy_approved') THEN
    RAISE EXCEPTION 'Only a senior-approved draft quote attached to a Jobcard can be issued.' USING ERRCODE = 'P0001';
  END IF;

  SELECT id, request_type, stage, status, archived_at
    INTO v_enquiry
    FROM public.enquiries
   WHERE id = v_quote.enquiry_id
     AND business_id = p_business_id
   FOR UPDATE;

  IF NOT FOUND OR v_enquiry.request_type <> 'quote_request'
     OR v_enquiry.archived_at IS NOT NULL
     OR v_enquiry.status NOT IN ('new', 'reviewing', 'quoted') THEN
    RAISE EXCEPTION 'This Jobcard is not available for quoting.' USING ERRCODE = 'P0001';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.quotes q
     WHERE q.business_id = p_business_id
       AND q.enquiry_id = v_enquiry.id
       AND q.quote_kind = 'standard'
       AND q.status = 'sent'
       AND q.id <> v_quote.id
       AND q.revision_number >= v_quote.revision_number
  ) THEN
    RAISE EXCEPTION 'A newer quote revision is already issued.' USING ERRCODE = 'P0001';
  END IF;

  -- Keep the currently issued revision valid while a replacement is only a draft.
  -- Supersede earlier issued revisions atomically with issuing the new approved revision.
  WITH superseded AS (
    UPDATE public.quotes
       SET status = 'superseded',
           updated_at = v_now
     WHERE business_id = p_business_id
       AND enquiry_id = v_enquiry.id
       AND quote_kind = 'standard'
       AND status = 'sent'
       AND id <> v_quote.id
       AND revision_number < v_quote.revision_number
    RETURNING id, quote_number, revision_number
  )
  INSERT INTO public.audit_events
    (business_id, actor_user_id, action, entity_type, entity_id, details)
  SELECT p_business_id, p_actor_user_id, 'quote.superseded', 'quote', superseded.id,
         jsonb_build_object('quote_number', superseded.quote_number,
           'superseded_by_quote_id', v_quote.id,
           'new_revision_number', v_quote.revision_number)
    FROM superseded;

  UPDATE public.quotes
     SET status = 'sent',
         issue_date = (v_now AT TIME ZONE 'Australia/Sydney')::date,
         updated_at = v_now
   WHERE id = v_quote.id;

  UPDATE public.enquiries
     SET stage = 'quote_sent',
         status = 'quoted',
         updated_at = v_now
   WHERE id = v_enquiry.id
     AND business_id = p_business_id;

  IF v_enquiry.stage IS DISTINCT FROM 'quote_sent' THEN
    INSERT INTO public.enquiry_stage_history
      (business_id, enquiry_id, from_stage, to_stage, changed_by, note)
    VALUES
      (p_business_id, v_enquiry.id, v_enquiry.stage, 'quote_sent', p_actor_user_id,
       'Senior-approved quote ' || v_quote.quote_number || ' issued to the customer.');
  END IF;

  INSERT INTO public.audit_events
    (business_id, actor_user_id, action, entity_type, entity_id, details)
  VALUES
    (p_business_id, p_actor_user_id, 'quote.issued', 'quote', v_quote.id,
     jsonb_build_object('quote_number', v_quote.quote_number, 'enquiry_id', v_enquiry.id, 'total', v_quote.total));

  RETURN jsonb_build_object('success', true, 'quote_id', v_quote.id,
    'quote_number', v_quote.quote_number, 'enquiry_id', v_enquiry.id);
END;
$$;
REVOKE ALL ON FUNCTION public.review_quote(uuid,uuid,uuid,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.review_quote(uuid,uuid,uuid,text,text) TO service_role;

-- A guest variation can only be issued while the original secure guest access remains valid.
CREATE OR REPLACE FUNCTION public.issue_job_variation_quote(
  p_quote_id uuid,p_business_id uuid,p_actor_user_id uuid
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public
AS $$
DECLARE v_quote record; v_job record; v_now timestamptz:=clock_timestamp();
BEGIN
  SELECT id,business_id,job_id,quote_number,status,senior_approval_status,total
    INTO v_quote FROM public.quotes
   WHERE id=p_quote_id AND business_id=p_business_id AND quote_kind='variation'
   FOR UPDATE;
  IF NOT FOUND OR v_quote.status<>'draft'
     OR v_quote.senior_approval_status NOT IN ('approved','legacy_approved')
     OR v_quote.job_id IS NULL THEN
    RAISE EXCEPTION 'Only a senior-approved draft variation can be issued.' USING ERRCODE='P0001';
  END IF;
  SELECT id,status,user_id,enquiry_id,worker_signed_off_at,workcard_review_status INTO v_job FROM public.jobs
   WHERE id=v_quote.job_id AND business_id=p_business_id FOR UPDATE;
  IF NOT FOUND OR v_job.status NOT IN ('pending','scheduled','in_progress','waiting_parts') OR v_job.worker_signed_off_at IS NOT NULL OR v_job.workcard_review_status NOT IN ('approved','legacy_approved') THEN
    RAISE EXCEPTION 'This Workcard is no longer open for variations.' USING ERRCODE='P0001';
  END IF;
  IF v_job.user_id IS NULL AND NOT EXISTS (
    SELECT 1 FROM public.enquiries e
     WHERE e.id = v_job.enquiry_id
       AND e.business_id = p_business_id
       AND e.request_type = 'quote_request'
       AND e.user_id IS NULL
       AND e.guest_access_token_hash IS NOT NULL
       AND e.guest_access_expires_at > v_now
       AND e.archived_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Guest access has expired. The customer must re-establish access before a variation can be issued.' USING ERRCODE='P0001';
  END IF;
  IF EXISTS(SELECT 1 FROM public.quotes q WHERE q.job_id=v_job.id AND q.quote_kind='variation' AND q.id<>v_quote.id AND q.status IN ('draft','sent')) THEN
    RAISE EXCEPTION 'Another variation is already awaiting review or customer decision.' USING ERRCODE='P0001';
  END IF;
  UPDATE public.quotes SET status='sent',
    issue_date=(v_now AT TIME ZONE 'Australia/Sydney')::date,updated_at=v_now
   WHERE id=v_quote.id;
  INSERT INTO public.audit_events(business_id,actor_user_id,action,entity_type,entity_id,details)
  VALUES(p_business_id,p_actor_user_id,'workcard.variation_issued','quote',v_quote.id,
    jsonb_build_object('job_id',v_job.id,'quote_number',v_quote.quote_number,'total',v_quote.total));
  RETURN jsonb_build_object('success',true,'quote_id',v_quote.id,'job_id',v_job.id,'quote_number',v_quote.quote_number);
END;
$$;
REVOKE ALL ON FUNCTION public.issue_job_variation_quote(uuid,uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.issue_job_variation_quote(uuid,uuid,uuid) TO service_role;

-- Expiry applies to account and guest Workcard variation decisions as well.
CREATE OR REPLACE FUNCTION public.respond_to_job_variation(
  p_quote_id uuid,p_user_id uuid,p_response text,p_response_note text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public
AS $$
DECLARE v_quote record; v_job record; v_now timestamptz:=clock_timestamp();
BEGIN
  IF p_response NOT IN ('accepted','declined') THEN
    RAISE EXCEPTION 'Choose accept or decline.' USING ERRCODE='22023';
  END IF;
  SELECT id,business_id,job_id,enquiry_id,customer_id,user_id,quote_number,status,total,expiry_date
    INTO v_quote FROM public.quotes
   WHERE id=p_quote_id AND user_id=p_user_id AND quote_kind='variation'
   FOR UPDATE;
  IF NOT FOUND OR v_quote.status<>'sent' OR v_quote.job_id IS NULL THEN
    RAISE EXCEPTION 'This variation is no longer awaiting your decision.' USING ERRCODE='P0001';
  END IF;
  SELECT id,status,user_id INTO v_job FROM public.jobs
   WHERE id=v_quote.job_id AND business_id=v_quote.business_id FOR UPDATE;
  IF NOT FOUND OR v_job.user_id<>p_user_id OR v_job.status NOT IN ('pending','scheduled','in_progress','waiting_parts') THEN
    RAISE EXCEPTION 'This Workcard is no longer available for variation approval.' USING ERRCODE='P0001';
  END IF;
  IF v_quote.expiry_date IS NOT NULL AND v_quote.expiry_date < (v_now AT TIME ZONE 'Australia/Sydney')::date THEN
    UPDATE public.quotes SET status='expired',updated_at=v_now WHERE id=v_quote.id;
    INSERT INTO public.audit_events(business_id,actor_user_id,action,entity_type,entity_id,details)
    VALUES(v_quote.business_id,p_user_id,'workcard.variation_expired','quote',v_quote.id,
      jsonb_build_object('job_id',v_quote.job_id,'quote_number',v_quote.quote_number,'expiry_date',v_quote.expiry_date));
    RETURN jsonb_build_object('success',false,'expired',true,'quote_id',v_quote.id);
  END IF;
  UPDATE public.quotes SET status=p_response,response_at=v_now,
    response_note=NULLIF(left(trim(coalesce(p_response_note,'')),1000),''),
    updated_at=v_now WHERE id=v_quote.id;
  IF p_response='accepted' THEN
    INSERT INTO public.job_work_entries(
      business_id,job_id,created_by,entry_type,description,quantity,unit_price,tax_rate,line_total,
      customer_visible,source_quote_item_id
    )
    SELECT v_quote.business_id,v_job.id,p_user_id,qi.item_type,qi.description,qi.quantity,
      qi.unit_price,qi.tax_rate,qi.line_total,true,qi.id
    FROM public.quote_items qi WHERE qi.quote_id=v_quote.id
    ON CONFLICT(source_quote_item_id) WHERE source_quote_item_id IS NOT NULL DO NOTHING;
  END IF;
  INSERT INTO public.customer_messages(business_id,customer_id,user_id,enquiry_id,quote_id,sender_type,sender_user_id,message,is_internal)
  VALUES(v_quote.business_id,v_quote.customer_id,p_user_id,v_quote.enquiry_id,v_quote.id,'customer',p_user_id,
    'Variation '||v_quote.quote_number||' was '||p_response||' by the customer.'
      ||CASE WHEN NULLIF(trim(coalesce(p_response_note,'')),'') IS NULL THEN '' ELSE ' Customer note: '||left(trim(p_response_note),1000) END,
    false);
  INSERT INTO public.audit_events(business_id,actor_user_id,action,entity_type,entity_id,details)
  VALUES(v_quote.business_id,p_user_id,'workcard.variation_'||p_response,'quote',v_quote.id,
    jsonb_build_object('job_id',v_job.id,'quote_number',v_quote.quote_number,'response_at',v_now,
      'response_note',NULLIF(left(trim(coalesce(p_response_note,'')),1000),'')));
  RETURN jsonb_build_object('success',true,'response',p_response,'quote_id',v_quote.id,'job_id',v_job.id,'response_at',v_now);
END;
$$;
REVOKE ALL ON FUNCTION public.respond_to_job_variation(uuid,uuid,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.respond_to_job_variation(uuid,uuid,text,text) TO service_role;

CREATE OR REPLACE FUNCTION public.respond_to_guest_job_variation(
 p_ticket_id uuid,p_quote_id uuid,p_guest_token_hash text,p_response text,p_response_note text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_enquiry record; v_quote record; v_job record; v_now timestamptz:=clock_timestamp();
BEGIN
 IF p_response NOT IN ('accepted','declined') THEN RAISE EXCEPTION 'Choose accept or decline.' USING ERRCODE='22023'; END IF;
 SELECT id,business_id,contact_name,email INTO v_enquiry FROM public.enquiries
  WHERE id=p_ticket_id AND request_type='quote_request' AND user_id IS NULL
   AND guest_access_token_hash=p_guest_token_hash AND guest_access_expires_at>v_now
   AND archived_at IS NULL FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Guest request access is no longer available.' USING ERRCODE='P0001'; END IF;
 SELECT id,business_id,enquiry_id,job_id,quote_number,status,user_id,customer_id,expiry_date INTO v_quote FROM public.quotes
  WHERE id=p_quote_id AND business_id=v_enquiry.business_id AND enquiry_id=v_enquiry.id
   AND quote_kind='variation' AND user_id IS NULL FOR UPDATE;
 IF NOT FOUND OR v_quote.status<>'sent' OR v_quote.job_id IS NULL THEN
  RAISE EXCEPTION 'This variation is no longer awaiting your decision.' USING ERRCODE='P0001';
 END IF;
 SELECT id,status,user_id INTO v_job FROM public.jobs WHERE id=v_quote.job_id
  AND business_id=v_quote.business_id FOR UPDATE;
 IF NOT FOUND OR v_job.user_id IS NOT NULL OR v_job.status NOT IN ('pending','scheduled','in_progress','waiting_parts') THEN
  RAISE EXCEPTION 'This Workcard is no longer available for variation approval.' USING ERRCODE='P0001';
 END IF;
 IF v_quote.expiry_date IS NOT NULL AND v_quote.expiry_date < (v_now AT TIME ZONE 'Australia/Sydney')::date THEN
  UPDATE public.quotes SET status='expired',updated_at=v_now WHERE id=v_quote.id;
  INSERT INTO public.audit_events(business_id,actor_user_id,action,entity_type,entity_id,details)
  VALUES(v_quote.business_id,NULL,'guest_workcard.variation_expired','quote',v_quote.id,
    jsonb_build_object('job_id',v_quote.job_id,'quote_number',v_quote.quote_number,'expiry_date',v_quote.expiry_date));
  RETURN jsonb_build_object('success',false,'expired',true,'quote_id',v_quote.id);
 END IF;
 UPDATE public.quotes SET status=p_response,response_at=v_now,
  response_note=NULLIF(left(trim(coalesce(p_response_note,'')),1000),''),updated_at=v_now
 WHERE id=v_quote.id;
 IF p_response='accepted' THEN
  INSERT INTO public.job_work_entries(business_id,job_id,created_by,entry_type,description,quantity,unit_price,tax_rate,line_total,customer_visible,source_quote_item_id)
  SELECT v_quote.business_id,v_job.id,NULL,qi.item_type,qi.description,qi.quantity,qi.unit_price,qi.tax_rate,qi.line_total,true,qi.id
  FROM public.quote_items qi WHERE qi.quote_id=v_quote.id
  ON CONFLICT(source_quote_item_id) WHERE source_quote_item_id IS NOT NULL DO NOTHING;
 END IF;
 INSERT INTO public.customer_messages(business_id,customer_id,user_id,enquiry_id,quote_id,sender_type,sender_user_id,guest_name,guest_email,message,is_internal)
 VALUES(v_quote.business_id,NULL,NULL,v_enquiry.id,v_quote.id,'customer',NULL,v_enquiry.contact_name,v_enquiry.email,
  'Variation '||v_quote.quote_number||' was '||p_response||' by the guest customer.'
   ||CASE WHEN NULLIF(trim(coalesce(p_response_note,'')),'') IS NULL THEN '' ELSE ' Customer note: '||left(p_response_note,1000) END,false);
 INSERT INTO public.audit_events(business_id,actor_user_id,action,entity_type,entity_id,details)
 VALUES(v_quote.business_id,NULL,'guest_workcard.variation_'||p_response,'quote',v_quote.id,
  jsonb_build_object('job_id',v_job.id,'quote_number',v_quote.quote_number,'response_at',v_now,
   'response_note',NULLIF(left(trim(coalesce(p_response_note,'')),1000),'')));
 RETURN jsonb_build_object('success',true,'response',p_response,'quote_id',v_quote.id,'job_id',v_job.id,'response_at',v_now);
END; $$;
REVOKE ALL ON FUNCTION public.respond_to_guest_job_variation(uuid,uuid,text,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.respond_to_guest_job_variation(uuid,uuid,text,text,text) TO service_role;

-- Preserve service preset links when a returned variation is revised.
CREATE OR REPLACE FUNCTION public.revise_job_variation_quote(
 p_quote_id uuid,
 p_business_id uuid,
 p_actor_user_id uuid,
 p_reason text,
 p_items jsonb,
 p_tax_rate numeric,
 p_notes text DEFAULT NULL,
 p_terms text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
 v_old record;
 v_now timestamptz:=clock_timestamp();
 v_subtotal numeric(12,2);
 v_tax numeric(12,2);
 v_total numeric(12,2);
 v_new public.quotes%ROWTYPE;
 v_number text;
BEGIN
 IF length(trim(coalesce(p_reason,'')))<5 OR jsonb_typeof(p_items)<>'array' OR jsonb_array_length(p_items)<1 OR jsonb_array_length(p_items)>30 OR p_tax_rate<0 OR p_tax_rate>100 THEN
  RAISE EXCEPTION 'Invalid variation revision details.' USING ERRCODE='22023';
 END IF;
 SELECT * INTO v_old FROM public.quotes WHERE id=p_quote_id AND business_id=p_business_id
  AND quote_kind='variation' AND status='draft' AND senior_approval_status='changes_requested' FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Only a variation returned for revision can be revised.' USING ERRCODE='P0001'; END IF;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(p_items) x WHERE
  coalesce(x->>'item_type','') NOT IN ('labour','parts') OR length(trim(coalesce(x->>'description','')))<3
  OR coalesce((x->>'quantity')::numeric,0)<=0 OR coalesce((x->>'unit_price')::numeric,-1)<0
  OR (nullif(x->>'service_id','') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.services s WHERE s.id=(x->>'service_id')::uuid AND s.business_id=p_business_id AND s.is_active))) THEN
  RAISE EXCEPTION 'Variation line items are invalid.' USING ERRCODE='22023';
 END IF;
 SELECT round(sum((x->>'quantity')::numeric*(x->>'unit_price')::numeric),2),
  round(sum((x->>'quantity')::numeric*(x->>'unit_price')::numeric*p_tax_rate/100),2)
 INTO v_subtotal,v_tax FROM jsonb_array_elements(p_items) x;
 v_subtotal:=coalesce(v_subtotal,0);v_tax:=coalesce(v_tax,0);v_total:=v_subtotal+v_tax;
 UPDATE public.quotes SET status='superseded',updated_at=v_now WHERE id=v_old.id;
 v_number:='BRV-V-'||upper(to_char(v_now AT TIME ZONE 'Australia/Sydney','YYMMDDHH24MISS'))||'-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,4));
 INSERT INTO public.quotes(business_id,customer_id,user_id,enquiry_id,job_id,quote_kind,variation_reason,
  quote_number,status,revision_number,supersedes_quote_id,prepared_by,senior_approval_status,
  subtotal,tax_amount,total,notes,terms,created_at,updated_at)
 VALUES(v_old.business_id,v_old.customer_id,v_old.user_id,v_old.enquiry_id,v_old.job_id,'variation',
  left(trim(p_reason),2000),v_number,'draft',v_old.revision_number+1,v_old.id,p_actor_user_id,'pending',
  v_subtotal,v_tax,v_total,nullif(left(trim(coalesce(p_notes,'')),3000),''),nullif(left(trim(coalesce(p_terms,'')),3000),''),v_now,v_now)
 RETURNING * INTO v_new;
 INSERT INTO public.quote_items(quote_id,item_type,description,quantity,unit_price,tax_rate,line_total,sort_order,service_id)
 SELECT v_new.id,x->>'item_type',left(trim(x->>'description'),500),(x->>'quantity')::numeric,
  (x->>'unit_price')::numeric,p_tax_rate,
  round((x->>'quantity')::numeric*(x->>'unit_price')::numeric*(1+p_tax_rate/100),2),
  coalesce((x->>'sort_order')::integer,0),nullif(x->>'service_id','')::uuid
 FROM jsonb_array_elements(p_items) x;
 INSERT INTO public.audit_events(business_id,actor_user_id,action,entity_type,entity_id,details)
 VALUES(p_business_id,p_actor_user_id,'workcard.variation_revised','quote',v_new.id,
  jsonb_build_object('previous_quote_id',v_old.id,'previous_quote_number',v_old.quote_number,'revision_number',v_new.revision_number,'total',v_total));
 RETURN jsonb_build_object('success',true,'quote_id',v_new.id,'quote_number',v_new.quote_number,'revision_number',v_new.revision_number,'total',v_new.total);
END;
$function$;
REVOKE ALL ON FUNCTION public.revise_job_variation_quote(uuid,uuid,uuid,text,jsonb,numeric,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.revise_job_variation_quote(uuid,uuid,uuid,text,jsonb,numeric,text,text) TO service_role;
