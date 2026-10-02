-- 1) Lock old table to freeze writes during swap
LOCK TABLE public.meter_power_readings_5min IN ACCESS EXCLUSIVE MODE;
LOCK TABLE public.meter_power_readings_5min_part IN ACCESS EXCLUSIVE MODE;

-- 2) Copy delta rows written since the bulk copy
INSERT INTO public.meter_power_readings_5min_part
  (id, meter_id, tenant_id, energy_type, power_avg, power_max, bucket, sample_count, created_at, resolution_minutes, source)
SELECT o.id, o.meter_id, o.tenant_id, o.energy_type, o.power_avg, o.power_max, o.bucket, o.sample_count, o.created_at, o.resolution_minutes, o.source
FROM public.meter_power_readings_5min o
WHERE o.bucket >= (SELECT COALESCE(max(bucket), '-infinity'::timestamptz) - interval '1 day' FROM public.meter_power_readings_5min_part)
ON CONFLICT DO NOTHING;

-- 3) Atomic rename swap
ALTER TABLE public.meter_power_readings_5min RENAME TO meter_power_readings_5min_legacy;
ALTER TABLE public.meter_power_readings_5min_part RENAME TO meter_power_readings_5min;

-- 4) Grants on the new active table
GRANT SELECT, INSERT, UPDATE, DELETE ON public.meter_power_readings_5min TO authenticated;
GRANT ALL ON public.meter_power_readings_5min TO service_role;