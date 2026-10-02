-- 1) energy_settings JSONB auf charge_points
ALTER TABLE public.charge_points
ADD COLUMN IF NOT EXISTS energy_settings jsonb NOT NULL DEFAULT jsonb_build_object(
  'dynamic_load_management', false,
  'pv_surplus_charging', false,
  'cheap_charging_mode', false
);

-- 2) solar_charging_config auch für einzelne Ladepunkte
ALTER TABLE public.solar_charging_config
  ADD COLUMN IF NOT EXISTS charge_point_id uuid REFERENCES public.charge_points(id) ON DELETE CASCADE;

-- group_id darf nun NULL sein (eine der beiden Spalten muss gesetzt sein)
ALTER TABLE public.solar_charging_config
  ALTER COLUMN group_id DROP NOT NULL;

-- XOR-Constraint: genau eines von group_id/charge_point_id muss gesetzt sein
ALTER TABLE public.solar_charging_config
  DROP CONSTRAINT IF EXISTS solar_charging_config_scope_check;
ALTER TABLE public.solar_charging_config
  ADD CONSTRAINT solar_charging_config_scope_check
  CHECK ((group_id IS NOT NULL)::int + (charge_point_id IS NOT NULL)::int = 1);

-- Eindeutigkeit pro tenant + scope
CREATE UNIQUE INDEX IF NOT EXISTS solar_charging_config_tenant_cp_unique
  ON public.solar_charging_config (tenant_id, charge_point_id)
  WHERE charge_point_id IS NOT NULL;
