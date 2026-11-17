-- Allow top-three management to progress a standard quote without recording a false customer response.
ALTER TABLE public.quotes
 ADD COLUMN IF NOT EXISTS customer_approval_bypassed_at timestamptz,
 ADD COLUMN IF NOT EXISTS customer_approval_bypassed_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
 ADD COLUMN IF NOT EXISTS customer_approval_bypass_reason text;

CREATE OR REPLACE FUNCTION public.bypass_quote_customer_approval(
 p_quote_id uuid,p_business_id uuid,p_actor_user_id uuid,p_reason text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $$
DECLARE
 v_quote record;v_enquiry record;v_now timestamptz:=clock_timestamp();v_reason text;
BEGIN
 v_reason:=left(trim(coalesce(p_reason,'')),2000);
 IF length(v_reason)<5 THEN RAISE EXCEPTION 'Provide a reason of at least five characters.' USING ERRCODE='22023'; END IF;
 IF NOT public.user_has_effective_permission(p_actor_user_id,'workflow.bypass_customer_approval') THEN
  RAISE EXCEPTION 'You do not have permission to bypass customer approval.' USING ERRCODE='42501';
 END IF;
 SELECT id,business_id,enquiry_id,quote_number,status,quote_kind,customer_approval_bypassed_at
 INTO v_quote FROM public.quotes WHERE id=p_quote_id AND business_id=p_business_id FOR UPDATE;
 IF NOT FOUND OR v_quote.status<>'sent' OR v_quote.quote_kind<>'standard' OR v_quote.enquiry_id IS NULL THEN
  RAISE EXCEPTION 'Only an issued standard quote on an active Quote Request can be bypassed.' USING ERRCODE='P0001';
 END IF;
 IF v_quote.customer_approval_bypassed_at IS NOT NULL THEN
  RAISE EXCEPTION 'Customer approval has already been bypassed for this quote.' USING ERRCODE='P0001';
 END IF;
 SELECT id,business_id,stage,request_type,archived_at,status
 INTO v_enquiry FROM public.enquiries
 WHERE id=v_quote.enquiry_id AND business_id=p_business_id FOR UPDATE;
 IF NOT FOUND OR v_enquiry.request_type<>'quote_request' OR v_enquiry.archived_at IS NOT NULL
   OR v_enquiry.status IN ('closed','declined') THEN
  RAISE EXCEPTION 'The linked Quote Request is no longer active.' USING ERRCODE='P0001';
 END IF;
 UPDATE public.quotes SET status='accepted',
  customer_approval_bypassed_at=v_now,customer_approval_bypassed_by=p_actor_user_id,
  customer_approval_bypass_reason=v_reason,updated_at=v_now
 WHERE id=v_quote.id AND business_id=p_business_id AND status='sent';
 UPDATE public.enquiries SET stage='approved',status='accepted',updated_at=v_now
 WHERE id=v_enquiry.id AND business_id=p_business_id;
 IF v_enquiry.stage IS DISTINCT FROM 'approved' THEN
  INSERT INTO public.enquiry_stage_history(business_id,enquiry_id,from_stage,to_stage,changed_by,note)
  VALUES(p_business_id,v_enquiry.id,v_enquiry.stage,'approved',p_actor_user_id,
   'Management bypassed customer approval for quote '||v_quote.quote_number||'. Reason: '||v_reason);
 END IF;
 INSERT INTO public.customer_messages(business_id,customer_id,user_id,enquiry_id,quote_id,sender_type,sender_user_id,message,is_internal)
 VALUES(p_business_id,NULL,NULL,v_enquiry.id,v_quote.id,'staff',p_actor_user_id,
  'Management progressed quote '||v_quote.quote_number||' without recording customer approval. Reason: '||v_reason,true);
 INSERT INTO public.audit_events(business_id,actor_user_id,action,entity_type,entity_id,details)
 VALUES(p_business_id,p_actor_user_id,'quote.customer_approval_bypassed','quote',v_quote.id,
  jsonb_build_object('reason',v_reason,'enquiry_id',v_enquiry.id,'quote_number',v_quote.quote_number,
   'customer_response_recorded',false,'next_stage','approved'));
 RETURN jsonb_build_object('success',true,'quote_id',v_quote.id,'enquiry_id',v_enquiry.id,
  'customer_response_recorded',false,'bypassed',true);
END;
$$;
REVOKE ALL ON FUNCTION public.bypass_quote_customer_approval(uuid,uuid,uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.bypass_quote_customer_approval(uuid,uuid,uuid,text) TO service_role;
