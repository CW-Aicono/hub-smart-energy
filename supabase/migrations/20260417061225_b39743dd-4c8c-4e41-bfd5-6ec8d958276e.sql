
-- Add discovery metadata to meters for HA-Auto-Discovery
ALTER TABLE public.meters
  ADD COLUMN IF NOT EXISTS discovery_source TEXT,
  ADD COLUMN IF NOT EXISTS discovery_payload JSONB,
  ADD COLUMN IF NOT EXISTS discovery_confirmed BOOLEAN NOT NULL DEFAULT true;

CREATE INDEX IF NOT EXISTS idx_meters_discovery_unconfirmed
  ON public.meters(tenant_id, discovery_confirmed)
  WHERE discovery_confirmed = false;

COMMENT ON COLUMN public.meters.discovery_source IS 'Origin of automatic device discovery, e.g. ''mqtt_homeassistant''. NULL for manually created meters.';
COMMENT ON COLUMN public.meters.discovery_payload IS 'Raw discovery payload (e.g. HA-Discovery JSON) for traceability.';
COMMENT ON COLUMN public.meters.discovery_confirmed IS 'False for auto-discovered meters until an admin confirms them in the UI. Unconfirmed meters are excluded from reports.';

-- Table for MQTT actuators (used by automation engine to publish commands)
CREATE TABLE IF NOT EXISTS public.mqtt_actuators (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  location_integration_id UUID NOT NULL REFERENCES public.location_integrations(id) ON DELETE CASCADE,
  actuator_uuid TEXT NOT NULL,
  name TEXT NOT NULL,
  command_topic TEXT NOT NULL,
  state_topic TEXT,
  payload_on TEXT NOT NULL DEFAULT 'ON',
  payload_off TEXT NOT NULL DEFAULT 'OFF',
  payload_template TEXT,
  qos SMALLINT NOT NULL DEFAULT 1 CHECK (qos IN (0, 1, 2)),
  retain BOOLEAN NOT NULL DEFAULT false,
  discovery_source TEXT,
  discovery_payload JSONB,
  discovery_confirmed BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(tenant_id, actuator_uuid)
);

ALTER TABLE public.mqtt_actuators ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant members read mqtt_actuators"
  ON public.mqtt_actuators FOR SELECT
  USING (tenant_id = public.get_user_tenant_id() OR public.has_role(auth.uid(), 'super_admin'::public.app_role));

CREATE POLICY "Tenant admins manage mqtt_actuators"
  ON public.mqtt_actuators FOR ALL
  USING (
    tenant_id = public.get_user_tenant_id()
    AND (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'super_admin'::public.app_role))
  )
  WITH CHECK (
    tenant_id = public.get_user_tenant_id()
    AND (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'super_admin'::public.app_role))
  );

CREATE TRIGGER update_mqtt_actuators_updated_at
  BEFORE UPDATE ON public.mqtt_actuators
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX IF NOT EXISTS idx_mqtt_actuators_tenant ON public.mqtt_actuators(tenant_id);
CREATE INDEX IF NOT EXISTS idx_mqtt_actuators_loc_int ON public.mqtt_actuators(location_integration_id);
