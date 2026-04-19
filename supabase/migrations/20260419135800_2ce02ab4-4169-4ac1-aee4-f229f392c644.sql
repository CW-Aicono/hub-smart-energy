-- 1. Duplikate löschen: pro (tenant_id, device_name) nur die zuletzt aktive Row behalten
DELETE FROM public.gateway_devices gd
WHERE gd.id NOT IN (
  SELECT DISTINCT ON (tenant_id, device_name) id
  FROM public.gateway_devices
  ORDER BY tenant_id, device_name,
    last_heartbeat_at DESC NULLS LAST,
    created_at DESC NULLS LAST
);

-- 2. Unique Index zur Verhinderung künftiger Duplikate
CREATE UNIQUE INDEX IF NOT EXISTS gateway_devices_tenant_device_uq
  ON public.gateway_devices(tenant_id, device_name);