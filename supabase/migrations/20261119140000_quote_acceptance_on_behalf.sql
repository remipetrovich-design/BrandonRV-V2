-- Record verbal/in-person quote acceptance by authorised staff, with attribution and audit.
INSERT INTO public.permissions(permission_key,description)
VALUES ('quotes.accept_on_behalf','Record customer quote acceptance on behalf of the customer after verbal or other direct confirmation.')
ON CONFLICT(permission_key) DO UPDATE SET description=EXCLUDED.description;
INSERT INTO public.user_role_permissions(role_key,permission_key)
SELECT roles.role_key,'quotes.accept_on_behalf'
FROM unnest(ARRAY['manager','ceo_founder','website_development_specialist','senior_manager']) roles(role_key)
ON CONFLICT DO NOTHING;
CREATE OR REPLACE FUNCTION public.accept_quote_on_behalf(p_quote_id uuid,p_business_id uuid,p_actor_user_id uuid,p_reason text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_quote record; v_enquiry record; v_now timestamptz:=clock_timestamp();
BEGIN
 IF length(trim(coalesce(p_reason,'')))<5 THEN RAISE EXCEPTION 'Record how the customer confirmed acceptance.' USING ERRCODE='22023'; END IF;
 IF NOT public.user_has_effective_permission(p_actor_user_id,'quotes.accept_on_behalf') THEN RAISE EXCEPTION 'You do not have permission to accept quotes on behalf of customers.' USING ERRCODE='42501'; END IF;
 SELECT id,quote_number,status,customer_id,user_id,enquiry_id INTO v_quote FROM public.quotes WHERE id=p_quote_id AND business_id=p_business_id FOR UPDATE;
 IF NOT FOUND OR v_quote.status<>'sent' THEN RAISE EXCEPTION 'Only an issued quote can be accepted.' USING ERRCODE='P0001'; END IF;
 IF v_quote.enquiry_id IS NULL THEN RAISE EXCEPTION 'This quote is not linked to a Quote Request Jobcard.' USING ERRCODE='P0001'; END IF;
 SELECT id,stage,status,request_type,archived_at INTO v_enquiry FROM public.enquiries WHERE id=v_quote.enquiry_id AND business_id=p_business_id FOR UPDATE;
 IF NOT FOUND OR v_enquiry.request_type<>'quote_request' OR v_enquiry.archived_at IS NOT NULL THEN RAISE EXCEPTION 'The linked Quote Request Jobcard is not active.' USING ERRCODE='P0001'; END IF;
 UPDATE public.quotes SET status='accepted',response_at=v_now,response_note=left(trim(p_reason),1000),updated_at=v_now WHERE id=p_quote_id AND business_id=p_business_id;
 UPDATE public.enquiries SET stage='approved',status='accepted',updated_at=v_now WHERE id=v_enquiry.id AND business_id=p_business_id;
 IF v_enquiry.stage IS DISTINCT FROM 'approved' THEN
  INSERT INTO public.enquiry_stage_history(business_id,enquiry_id,from_stage,to_stage,changed_by,note)
  VALUES(p_business_id,v_enquiry.id,v_enquiry.stage,'approved',p_actor_user_id,'Staff recorded acceptance on behalf of the customer for quote '||v_quote.quote_number||': '||left(trim(p_reason),1000));
 END IF;
 INSERT INTO public.customer_messages(business_id,customer_id,user_id,enquiry_id,quote_id,sender_type,sender_user_id,message,is_internal)
 VALUES(p_business_id,v_quote.customer_id,v_quote.user_id,v_quote.enquiry_id,p_quote_id,'staff',p_actor_user_id,'Staff recorded customer acceptance for quote '||v_quote.quote_number||'. Confirmation: '||left(trim(p_reason),1000),true);
 INSERT INTO public.audit_events(business_id,actor_user_id,action,entity_type,entity_id,details)
 VALUES(p_business_id,p_actor_user_id,'quote.accepted_on_behalf','quote',p_quote_id,jsonb_build_object('quote_number',v_quote.quote_number,'enquiry_id',v_quote.enquiry_id,'reason',left(trim(p_reason),1000),'response_at',v_now));
 RETURN jsonb_build_object('success',true,'quote_id',p_quote_id,'response_at',v_now,'enquiry_id',v_quote.enquiry_id);
END; $$;
REVOKE ALL ON FUNCTION public.accept_quote_on_behalf(uuid,uuid,uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.accept_quote_on_behalf(uuid,uuid,uuid,text) TO service_role;
