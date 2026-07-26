INSERT INTO public.sensor_readings_raw (tenant_id, meter_id, sensor_uuid, value, unit, recorded_at)
SELECT
  m.tenant_id,
  m.id,
  lower(m.sensor_uuid),
  replace(btrim(gdi.state), ',', '.')::numeric,
  gdi.unit,
  coalesce(gdi.last_seen_at, now())
FROM public.gateway_device_inventory gdi
JOIN public.meters m
  ON m.tenant_id = gdi.tenant_id
 AND coalesce(m.is_archived, false) = false
 AND m.sensor_uuid IS NOT NULL
 AND lower(m.sensor_uuid) = lower(gdi.entity_id)
 AND (
   m.location_integration_id IS NULL
   OR gdi.location_integration_id IS NULL
   OR m.location_integration_id = gdi.location_integration_id
 )
WHERE gdi.state IS NOT NULL
  AND btrim(gdi.state) ~ '^[-+]?[0-9]+([\.,][0-9]+)?$'
  AND NOT EXISTS (
    SELECT 1
    FROM public.sensor_readings_raw r
    WHERE r.meter_id = m.id
      AND r.recorded_at >= now() - interval '5 minutes'
  );