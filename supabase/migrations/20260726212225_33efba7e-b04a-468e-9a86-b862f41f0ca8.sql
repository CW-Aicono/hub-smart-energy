CREATE INDEX IF NOT EXISTS meters_sensor_uuid_lower_tenant_idx
ON public.meters (tenant_id, lower(sensor_uuid))
WHERE sensor_uuid IS NOT NULL AND coalesce(is_archived, false) = false;