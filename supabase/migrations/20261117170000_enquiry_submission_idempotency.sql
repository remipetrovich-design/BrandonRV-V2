-- One enquiry submission key can create only one canonical enquiry/Jobcard per business.
-- Null keys remain valid for internally-created records and older application versions.
ALTER TABLE public.enquiries
  ADD COLUMN IF NOT EXISTS submission_key uuid;

CREATE UNIQUE INDEX IF NOT EXISTS enquiries_business_submission_key_uidx
  ON public.enquiries (business_id, submission_key)
  WHERE submission_key IS NOT NULL;
