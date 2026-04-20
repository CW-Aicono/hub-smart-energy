-- Drop old unique constraint if exists and add group_id
ALTER TABLE public.solar_charging_config
  ADD COLUMN IF NOT EXISTS group_id uuid REFERENCES public.charge_point_groups(id) ON DELETE CASCADE;

-- Migrate: drop old location_id column, it's no longer needed
ALTER TABLE public.solar_charging_config
  DROP COLUMN IF EXISTS location_id;

-- Add unique constraint on tenant_id + group_id
ALTER TABLE public.solar_charging_config
  ADD CONSTRAINT solar_charging_config_tenant_group_unique UNIQUE (tenant_id, group_id);

-- Also update solar_charging_log: replace location_id with group_id
ALTER TABLE public.solar_charging_log
  ADD COLUMN IF NOT EXISTS group_id uuid REFERENCES public.charge_point_groups(id) ON DELETE CASCADE;

ALTER TABLE public.solar_charging_log
  DROP COLUMN IF EXISTS location_id;