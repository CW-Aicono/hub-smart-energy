-- 1. gateway_devices erweitern
ALTER TABLE public.gateway_devices
  ADD COLUMN IF NOT EXISTS mac_address text,
  ADD COLUMN IF NOT EXISTS location_id uuid REFERENCES public.locations(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS ws_connected_since timestamptz,
  ADD COLUMN IF NOT EXISTS last_ws_ping_at timestamptz;

CREATE UNIQUE INDEX IF NOT EXISTS gateway_devices_tenant_mac_unique
  ON public.gateway_devices (tenant_id, lower(mac_address))
  WHERE mac_address IS NOT NULL;

CREATE INDEX IF NOT EXISTS gateway_devices_location_idx
  ON public.gateway_devices (location_id) WHERE location_id IS NOT NULL;

-- 2. gateway_commands
CREATE TABLE IF NOT EXISTS public.gateway_commands (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  gateway_device_id uuid NOT NULL REFERENCES public.gateway_devices(id) ON DELETE CASCADE,
  command_type text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'pending',
  response jsonb,
  error_message text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz,
  acked_at timestamptz,
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '5 minutes')
);

CREATE INDEX IF NOT EXISTS gateway_commands_device_status_idx
  ON public.gateway_commands (gateway_device_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS gateway_commands_pending_idx
  ON public.gateway_commands (gateway_device_id, created_at) WHERE status = 'pending';

ALTER TABLE public.gateway_commands ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant members can view their gateway commands"
  ON public.gateway_commands FOR SELECT USING (tenant_id = public.get_user_tenant_id());
CREATE POLICY "Tenant members can create gateway commands"
  ON public.gateway_commands FOR INSERT WITH CHECK (tenant_id = public.get_user_tenant_id());
CREATE POLICY "Tenant members can update their gateway commands"
  ON public.gateway_commands FOR UPDATE USING (tenant_id = public.get_user_tenant_id());
CREATE POLICY "Tenant members can delete their gateway commands"
  ON public.gateway_commands FOR DELETE USING (tenant_id = public.get_user_tenant_id());

ALTER TABLE public.gateway_commands REPLICA IDENTITY FULL;
ALTER TABLE public.gateway_devices REPLICA IDENTITY FULL;
DO $$ BEGIN
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.gateway_commands;
  EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.gateway_devices;
  EXCEPTION WHEN duplicate_object THEN NULL; END;
END $$;

-- 3. Altlasten entfernen
-- IDs aller HA/HA-Addon Integrations sammeln (über generische integrations-Tabelle)
WITH ha_integrations AS (
  SELECT id FROM public.integrations
  WHERE type IN ('home_assistant', 'ha-addon', 'ha_addon')
), ha_loc_int AS (
  SELECT id FROM public.location_integrations
  WHERE integration_id IN (SELECT id FROM ha_integrations)
)
DELETE FROM public.location_automations
WHERE location_integration_id IN (SELECT id FROM ha_loc_int);

DELETE FROM public.floor_sensor_positions
WHERE location_integration_id IN (
  SELECT li.id FROM public.location_integrations li
  JOIN public.integrations i ON i.id = li.integration_id
  WHERE i.type IN ('home_assistant', 'ha-addon', 'ha_addon')
);

DELETE FROM public.integration_errors
WHERE integration_type IN ('home_assistant', 'ha-addon', 'ha_addon');

DELETE FROM public.gateway_devices
WHERE location_integration_id IN (
  SELECT li.id FROM public.location_integrations li
  JOIN public.integrations i ON i.id = li.integration_id
  WHERE i.type IN ('home_assistant', 'ha-addon', 'ha_addon')
);

DELETE FROM public.location_integrations
WHERE integration_id IN (
  SELECT id FROM public.integrations
  WHERE type IN ('home_assistant', 'ha-addon', 'ha_addon')
);

DELETE FROM public.integrations
WHERE type IN ('home_assistant', 'ha-addon', 'ha_addon');

DROP TABLE IF EXISTS public.ha_entity_states CASCADE;
DROP TABLE IF EXISTS public.cf_tunnels CASCADE;