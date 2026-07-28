-- Backfill last 24h from sensor_readings_raw to meter_power_readings for gateway-fed meters
INSERT INTO public.meter_power_readings (meter_id, tenant_id, energy_type, power_value, recorded_at)
SELECT
  sr.meter_id,
  m.tenant_id,
  COALESCE(m.energy_type::text, 'strom'),
  sr.value * CASE lower(m.source_unit_power)
    WHEN 'w' THEN 1.0/1000.0
    WHEN 'kw' THEN 1.0
    WHEN 'mw' THEN 1000.0
  END,
  sr.recorded_at
FROM public.sensor_readings_raw sr
JOIN public.meters m ON m.id = sr.meter_id
LEFT JOIN public.location_integrations li ON li.id = m.location_integration_id
LEFT JOIN public.integrations i ON i.id = li.integration_id
WHERE sr.recorded_at > now() - interval '24 hours'
  AND lower(coalesce(m.source_unit_power,'')) IN ('w','kw','mw')
  AND m.is_archived = false
  AND i.type IN ('aicono_gateway','home_assistant')
  AND NOT EXISTS (
    SELECT 1 FROM public.meter_power_readings mpr
    WHERE mpr.meter_id = sr.meter_id
      AND mpr.recorded_at = sr.recorded_at
  );