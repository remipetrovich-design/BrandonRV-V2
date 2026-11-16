-- Provide approved attendance hours as a payroll preparation input without calculating statutory pay.
CREATE OR REPLACE FUNCTION public.payroll_attendance_hours(
  p_business_id uuid,
  p_period_start date,
  p_period_end date
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_start timestamptz;
  v_end timestamptz;
  v_result jsonb;
BEGIN
  IF p_business_id IS NULL OR p_period_start IS NULL OR p_period_end IS NULL OR p_period_end < p_period_start THEN
    RAISE EXCEPTION 'Choose a valid payroll date range.' USING ERRCODE = '22023';
  END IF;

  v_start := p_period_start::timestamp AT TIME ZONE 'Australia/Sydney';
  v_end := (p_period_end + 1)::timestamp AT TIME ZONE 'Australia/Sydney';

  SELECT coalesce(
    pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object('user_id',summary.user_id,'hours',summary.hours)
      ORDER BY summary.user_id
    ),
    '[]'::jsonb
  )
    INTO v_result
    FROM (
      SELECT user_id,
             pg_catalog.round(
               sum(greatest(0,extract(epoch FROM (least(clock_out,v_end)-greatest(clock_in,v_start)))/60 - break_minutes)) / 60,
               2
             ) AS hours
        FROM public.attendance_entries
       WHERE business_id = p_business_id
         AND approved_at IS NOT NULL
         AND clock_out IS NOT NULL
         AND clock_in < v_end
         AND clock_out > v_start
       GROUP BY user_id
    ) summary;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.payroll_attendance_hours(uuid,date,date) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.payroll_attendance_hours(uuid,date,date) TO service_role;
