CREATE INDEX IF NOT EXISTS idx_meter_power_readings_created_at_brin
  ON public.meter_power_readings
  USING BRIN (created_at) WITH (pages_per_range = 32);