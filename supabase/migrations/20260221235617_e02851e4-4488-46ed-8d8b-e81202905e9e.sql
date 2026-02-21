ALTER TABLE public.tenant_electricity_tenants
ADD COLUMN is_mieterstrom boolean NOT NULL DEFAULT false;