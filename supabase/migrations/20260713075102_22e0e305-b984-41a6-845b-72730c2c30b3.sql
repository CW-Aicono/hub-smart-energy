ALTER TABLE public.energy_storages
  ADD COLUMN IF NOT EXISTS soc_sensor_uuid text,
  ADD COLUMN IF NOT EXISTS power_meter_id uuid REFERENCES public.meters(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS soc_updated_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_energy_storages_power_meter_id
  ON public.energy_storages(power_meter_id) WHERE power_meter_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_energy_storages_soc_sensor_uuid
  ON public.energy_storages(soc_sensor_uuid) WHERE soc_sensor_uuid IS NOT NULL;