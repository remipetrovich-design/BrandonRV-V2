-- Serialize first-owner creation so concurrent bootstrap requests cannot create multiple owners.
CREATE OR REPLACE FUNCTION public.bootstrap_first_owner(
  p_email text,
  p_full_name text,
  p_password_hash text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_business_id uuid;
  v_user record;
BEGIN
  PERFORM pg_catalog.pg_advisory_xact_lock(20261117160000::bigint);
  LOCK TABLE public.users IN EXCLUSIVE MODE;

  IF p_email IS NULL OR p_email <> lower(trim(p_email))
     OR length(p_email) < 5 OR length(p_email) > 254
     OR position('@' IN p_email) < 2
     OR p_full_name IS NULL OR length(trim(p_full_name)) < 2
     OR length(trim(p_full_name)) > 160
     OR p_password_hash IS NULL OR length(p_password_hash) < 20 THEN
    RAISE EXCEPTION 'Provide valid first-owner details.' USING ERRCODE = '22023';
  END IF;

  IF EXISTS (SELECT 1 FROM public.users LIMIT 1) THEN
    RAISE EXCEPTION 'Initial owner setup has already been completed.' USING ERRCODE = 'P0001';
  END IF;

  SELECT id INTO v_business_id
    FROM public.businesses
   WHERE slug='brandon-rv'
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Business setup is incomplete.' USING ERRCODE = 'P0002';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.user_roles WHERE role_key='ceo_founder') THEN
    RAISE EXCEPTION 'Owner role setup is incomplete.' USING ERRCODE = 'P0002';
  END IF;

  INSERT INTO public.users(
    email,full_name,first_name,last_name,password_hash,
    account_type,status,email_verified_at,primary_group,business_id,
    user_role,employee_number,job_title,employment_status,employment_type,start_date
  )
  VALUES(
    p_email,trim(p_full_name),
    split_part(trim(p_full_name),' ',1),
    nullif(trim(substr(trim(p_full_name),length(split_part(trim(p_full_name),' ',1))+1)),''),
    p_password_hash,'customer','active',pg_catalog.clock_timestamp(),'customer',v_business_id,
    'ceo_founder','OWNER','Owner','active','full_time',current_date
  )
  RETURNING id,email,full_name INTO v_user;

  INSERT INTO public.audit_events(business_id,actor_user_id,action,entity_type,entity_id,details)
  VALUES(v_business_id,v_user.id,'owner.bootstrap_completed','user',v_user.id,
    pg_catalog.jsonb_build_object('email',v_user.email,'role','ceo_founder'));

  RETURN pg_catalog.jsonb_build_object(
    'user',pg_catalog.jsonb_build_object('id',v_user.id,'email',v_user.email,'full_name',v_user.full_name)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.bootstrap_first_owner(text,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.bootstrap_first_owner(text,text,text) TO service_role;
