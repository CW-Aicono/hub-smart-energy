CREATE INDEX IF NOT EXISTS sensor_readings_raw_recorded_at_desc_idx
  ON public.sensor_readings_raw (recorded_at DESC);

CREATE INDEX IF NOT EXISTS sensor_readings_raw_tenant_recorded_at_desc_idx
  ON public.sensor_readings_raw (tenant_id, recorded_at DESC);

CREATE INDEX IF NOT EXISTS sensor_readings_5min_bucket_desc_idx
  ON public.sensor_readings_5min (bucket DESC);

CREATE INDEX IF NOT EXISTS sensor_readings_5min_tenant_bucket_desc_idx
  ON public.sensor_readings_5min (tenant_id, bucket DESC);