-- Provide approved attendance hours as a payroll preparation input without calculating statutory pay.
CREATE OR REPLACE FUNCTION public.payroll_attendance_summaries(
  p_business_id uuid,
  p_periods jsonb
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
  IF p_business_id IS NULL OR p_periods IS NULL OR pg_catalog.jsonb_typeof(p_periods) <> 'array' THEN
    RAISE EXCEPTION 'Choose valid payroll periods.' USING ERRCODE = '22023';
  END IF;

  WITH period_rows AS (
    SELECT p.id,p.period_start,p.period_end,
           p.period_start::timestamp AT TIME ZONE 'Australia/Sydney' AS starts_at,
           (p.period_end + 1)::timestamp AT TIME ZONE 'Australia/Sydney' AS ends_at
      FROM pg_catalog.jsonb_to_recordset(p_periods)
        AS p(id uuid,period_start date,period_end date)
     WHERE p.period_end >= p.period_start
  ),
  summaries AS (
    SELECT pr.id AS payroll_period_id,
           a.user_id,
           pg_catalog.round(
             sum(greatest(0,extract(epoch FROM (least(a.clock_out,pr.ends_at)-greatest(a.clock_in,pr.starts_at)))/60 - a.break_minutes)) / 60,
             2
           ) AS hours
      FROM period_rows pr
      JOIN public.attendance_entries a
        ON a.business_id = p_business_id
       AND a.approved_at IS NOT NULL
       AND a.clock_out IS NOT NULL
       AND a.clock_in < pr.ends_at
       AND a.clock_out > pr.starts_at
     GROUP BY pr.id,a.user_id
  )
  SELECT coalesce(
    pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object('payroll_period_id',payroll_period_id,'user_id',user_id,'hours',hours)
      ORDER BY payroll_period_id,user_id
    ),
    '[]'::jsonb
  )
    INTO v_result
    FROM summaries;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.payroll_attendance_summaries(uuid,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.payroll_attendance_summaries(uuid,jsonb) TO service_role;
