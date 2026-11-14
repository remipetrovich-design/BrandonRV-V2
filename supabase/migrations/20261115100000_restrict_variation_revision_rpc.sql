-- This privileged RPC is called only by the trusted server using service_role.
-- It accepts actor/business identifiers as parameters, so it must not be callable directly by public API roles.
REVOKE ALL ON FUNCTION public.revise_job_variation_quote(uuid,uuid,uuid,text,jsonb,numeric,text,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.revise_job_variation_quote(uuid,uuid,uuid,text,jsonb,numeric,text,text) TO service_role;
