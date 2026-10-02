CREATE INDEX IF NOT EXISTS idx_sensor_readings_5min_meter_bucket_covering
  ON public.sensor_readings_5min (meter_id, bucket DESC)
  INCLUDE (value_avg, value_min, value_max, sample_count);

ANALYZE public.sensor_readings_5min;