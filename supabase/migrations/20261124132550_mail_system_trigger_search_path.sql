-- Harden the shared updated_at trigger function with a fixed search path.
create or replace function public.mail_configuration_set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;