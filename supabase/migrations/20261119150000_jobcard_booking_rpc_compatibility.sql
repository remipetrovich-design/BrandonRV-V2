-- Preserve compatibility with callers using the original eight-argument
-- Jobcard booking RPC. The nine-argument implementation remains canonical;
-- legacy calls do not bypass scheduling conflict checks.
CREATE OR REPLACE FUNCTION public.update_jobcard_booking(
  p_business_id uuid,
  p_actor_user_id uuid,
  p_enquiry_id uuid,
  p_appointment_id uuid,
  p_action text,
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_location text
) RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.update_jobcard_booking(
    p_business_id,
    p_actor_user_id,
    p_enquiry_id,
    p_appointment_id,
    p_action,
    p_starts_at,
    p_ends_at,
    p_location,
    false
  );
$$;

REVOKE ALL ON FUNCTION public.update_jobcard_booking(uuid,uuid,uuid,uuid,text,timestamptz,timestamptz,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.update_jobcard_booking(uuid,uuid,uuid,uuid,text,timestamptz,timestamptz,text) TO service_role;
