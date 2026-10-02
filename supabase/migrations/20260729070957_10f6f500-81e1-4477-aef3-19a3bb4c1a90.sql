ALTER TABLE public.location_automations
  ADD COLUMN IF NOT EXISTS owner_gateway_device_id uuid NULL,
  ADD COLUMN IF NOT EXISTS owner_lease_until timestamptz NULL;

CREATE INDEX IF NOT EXISTS location_automations_mode_lease_idx
  ON public.location_automations (execution_mode, owner_lease_until);