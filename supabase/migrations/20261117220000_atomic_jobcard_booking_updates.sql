-- Update a Jobcard booking and every linked Workcard in one database transaction.
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
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_enquiry public.enquiries%ROWTYPE;
  v_appointment public.appointments%ROWTYPE;
  v_quote_ids uuid[];
  v_now timestamptz := clock_timestamp();
  v_next_stage text;
  v_workcards_updated integer := 0;
BEGIN
  IF p_action NOT IN ('confirm','reschedule','cancel') THEN
    RAISE EXCEPTION 'Choose confirm, reschedule or cancel.' USING ERRCODE = '22023';
  END IF;
  IF p_action <> 'cancel' AND (p_starts_at IS NULL OR length(trim(coalesce(p_location,''))) < 3) THEN
    RAISE EXCEPTION 'A booking start time and service location are required.' USING ERRCODE = '22023';
  END IF;
  IF p_ends_at IS NOT NULL AND p_ends_at <= p_starts_at THEN
    RAISE EXCEPTION 'Booking end must be after its start.' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_enquiry
    FROM public.enquiries
   WHERE id = p_enquiry_id AND business_id = p_business_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Jobcard not found.' USING ERRCODE = 'P0002';
  END IF;

  SELECT coalesce(array_agg(q.id),ARRAY[]::uuid[]) INTO v_quote_ids
    FROM public.quotes q
   WHERE q.business_id = p_business_id AND q.enquiry_id = p_enquiry_id;

  SELECT * INTO v_appointment
    FROM public.appointments
   WHERE id = p_appointment_id AND business_id = p_business_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Booking not found.' USING ERRCODE = 'P0002';
  END IF;
  IF v_appointment.enquiry_id IS DISTINCT FROM p_enquiry_id
     AND (v_appointment.quote_id IS NULL OR NOT (v_appointment.quote_id = ANY(v_quote_ids))) THEN
    RAISE EXCEPTION 'This booking does not belong to the selected Jobcard.' USING ERRCODE = 'P0001';
  END IF;
  IF v_appointment.status NOT IN ('requested','confirmed','rescheduled') THEN
    RAISE EXCEPTION 'This booking is no longer active.' USING ERRCODE = 'P0001';
  END IF;

  PERFORM 1 FROM public.jobs j
   WHERE j.business_id = p_business_id
     AND (j.appointment_id = p_appointment_id OR j.quote_id = ANY(v_quote_ids))
   FOR UPDATE;

  IF p_action = 'cancel' AND EXISTS (
    SELECT 1 FROM public.jobs j
     WHERE j.business_id = p_business_id
       AND (j.appointment_id = p_appointment_id OR j.quote_id = ANY(v_quote_ids))
       AND j.status NOT IN ('pending','scheduled')
  ) THEN
    RAISE EXCEPTION 'A booking cannot be cancelled after workshop work has started or the Workcard has closed.' USING ERRCODE = 'P0001';
  END IF;
  IF p_action IN ('confirm','reschedule') AND EXISTS (
    SELECT 1 FROM public.jobs j
     WHERE j.business_id = p_business_id
       AND (j.appointment_id = p_appointment_id OR j.quote_id = ANY(v_quote_ids))
       AND j.status IN ('in_progress','waiting_parts','completed','cancelled')
  ) THEN
    RAISE EXCEPTION 'A booking cannot be changed after workshop work has started or the Workcard has closed.' USING ERRCODE = 'P0001';
  END IF;

  IF p_action = 'cancel' THEN
    UPDATE public.appointments
       SET status = 'cancelled', updated_at = v_now
     WHERE id = p_appointment_id AND business_id = p_business_id
     RETURNING * INTO v_appointment;
  ELSE
    UPDATE public.appointments
       SET status = CASE WHEN p_action='confirm' THEN 'confirmed' ELSE 'rescheduled' END,
           starts_at = p_starts_at,
           ends_at = p_ends_at,
           location = left(trim(p_location),200),
           confirmed_by = p_actor_user_id,
           confirmed_at = v_now,
           updated_at = v_now
     WHERE id = p_appointment_id AND business_id = p_business_id
     RETURNING * INTO v_appointment;
  END IF;

  UPDATE public.jobs
     SET appointment_id = CASE WHEN p_action='cancel' THEN NULL ELSE p_appointment_id END,
         status = CASE
           WHEN p_action='cancel' AND status='scheduled' THEN 'pending'
           WHEN p_action<>'cancel' AND status='pending' THEN 'scheduled'
           ELSE status
         END,
         scheduled_start = CASE
           WHEN p_action='cancel' AND status='scheduled' THEN NULL
           WHEN p_action<>'cancel' THEN p_starts_at
           ELSE scheduled_start
         END,
         scheduled_end = CASE
           WHEN p_action='cancel' AND status='scheduled' THEN NULL
           WHEN p_action<>'cancel' THEN p_ends_at
           ELSE scheduled_end
         END,
         updated_at = v_now
   WHERE business_id = p_business_id
     AND (appointment_id = p_appointment_id OR quote_id = ANY(v_quote_ids));
  GET DIAGNOSTICS v_workcards_updated = ROW_COUNT;

  v_next_stage := CASE WHEN p_action='cancel' THEN 'ready_to_schedule' ELSE 'booked' END;
  IF v_enquiry.stage IN ('approved','workcard_created','ready_to_schedule','booking_requested','booked')
     AND v_enquiry.stage IS DISTINCT FROM v_next_stage THEN
    UPDATE public.enquiries
       SET stage = v_next_stage, status = 'converted', updated_at = v_now
     WHERE id = p_enquiry_id AND business_id = p_business_id;
    INSERT INTO public.enquiry_stage_history
      (business_id,enquiry_id,from_stage,to_stage,changed_by,note)
    VALUES
      (p_business_id,p_enquiry_id,v_enquiry.stage,v_next_stage,p_actor_user_id,
       CASE WHEN p_action='cancel' THEN 'Booking cancelled; return to scheduling.'
            ELSE 'Booking ' || CASE WHEN p_action='confirm' THEN 'confirmed' ELSE 'rescheduled' END || ' from the Jobcard.' END);
  END IF;

  INSERT INTO public.audit_events
    (business_id,actor_user_id,action,entity_type,entity_id,details)
  VALUES
    (p_business_id,p_actor_user_id,'jobcard.booking_'||p_action,'appointment',p_appointment_id,
     jsonb_build_object('enquiry_id',p_enquiry_id,'quote_id',v_appointment.quote_id,
       'workcards_updated',v_workcards_updated,'starts_at',v_appointment.starts_at,
       'ends_at',v_appointment.ends_at,'location',v_appointment.location));

  RETURN jsonb_build_object('appointment',to_jsonb(v_appointment),'workcardsUpdated',v_workcards_updated);
END;
$$;

REVOKE ALL ON FUNCTION public.update_jobcard_booking(uuid,uuid,uuid,uuid,text,timestamptz,timestamptz,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.update_jobcard_booking(uuid,uuid,uuid,uuid,text,timestamptz,timestamptz,text) TO service_role;
