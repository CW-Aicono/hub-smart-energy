ALTER TABLE public.gateway_devices
  ADD COLUMN IF NOT EXISTS mac_address text,
  ADD COLUMN IF NOT EXISTS gateway_username text,
  ADD COLUMN IF NOT EXISTS gateway_password_hash text;

CREATE UNIQUE INDEX IF NOT EXISTS gateway_devices_mac_address_key
  ON public.gateway_devices (mac_address)
  WHERE mac_address IS NOT NULL;

CREATE INDEX IF NOT EXISTS gateway_devices_pending_idx
  ON public.gateway_devices (last_heartbeat_at DESC)
  WHERE tenant_id IS NULL AND mac_address IS NOT NULL;