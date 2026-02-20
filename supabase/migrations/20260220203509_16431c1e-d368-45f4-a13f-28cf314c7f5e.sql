
-- 1. Make location_id mandatory on tenant_electricity_tenants
ALTER TABLE public.tenant_electricity_tenants
  ALTER COLUMN location_id SET NOT NULL;

-- 2. Add location_id to tenant_electricity_tariffs
ALTER TABLE public.tenant_electricity_tariffs
  ADD COLUMN location_id uuid REFERENCES public.locations(id);

-- For now allow NULL (we'll handle in code), but future tariffs require it
-- Update: make it NOT NULL since no tariffs exist yet
ALTER TABLE public.tenant_electricity_tariffs
  ALTER COLUMN location_id SET NOT NULL;
