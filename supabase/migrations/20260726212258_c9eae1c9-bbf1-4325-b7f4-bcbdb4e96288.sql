INSERT INTO public.sensor_readings_5min (
  tenant_id,
  meter_id,
  bucket,
  value_avg,
  value_min,
  value_max,
  value_last,
  sample_count,
  unit,
  updated_at
)
SELECT DISTINCT ON (r.meter_id, date_bin('5 minutes', r.recorded_at, timestamptz '2000-01-01'))
  r.tenant_id,
  r.meter_id,
  date_bin('5 minutes', r.recorded_at, timestamptz '2000-01-01') AS bucket,
  avg(r.value) OVER w AS value_avg,
  min(r.value) OVER w AS value_min,
  max(r.value) OVER w AS value_max,
  first_value(r.value) OVER (PARTITION BY r.meter_id, date_bin('5 minutes', r.recorded_at, timestamptz '2000-01-01') ORDER BY r.recorded_at DESC) AS value_last,
  count(*) OVER w AS sample_count,
  first_value(r.unit) OVER (PARTITION BY r.meter_id, date_bin('5 minutes', r.recorded_at, timestamptz '2000-01-01') ORDER BY r.recorded_at DESC) AS unit,
  now()
FROM public.sensor_readings_raw r
WHERE r.recorded_at >= now() - interval '24 hours'
WINDOW w AS (PARTITION BY r.meter_id, date_bin('5 minutes', r.recorded_at, timestamptz '2000-01-01'))
ON CONFLICT (meter_id, bucket) DO UPDATE SET
  value_avg = EXCLUDED.value_avg,
  value_min = EXCLUDED.value_min,
  value_max = EXCLUDED.value_max,
  value_last = EXCLUDED.value_last,
  sample_count = EXCLUDED.sample_count,
  unit = EXCLUDED.unit,
  updated_at = now();