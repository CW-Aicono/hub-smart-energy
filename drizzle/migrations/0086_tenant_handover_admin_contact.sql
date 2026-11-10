ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS handover_admin_email text;
ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS handover_admin_name text;
COMMENT ON COLUMN public.tenants.handover_admin_email IS 'Kunden-Admin, der die Zugangsmail erst bei Übergabe erhält';