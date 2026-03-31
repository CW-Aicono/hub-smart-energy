
-- gateway_devices: tracks registered HA add-on / Raspberry Pi gateways
CREATE TABLE public.gateway_devices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  location_integration_id uuid REFERENCES public.location_integrations(id) ON DELETE SET NULL,
  device_name text NOT NULL,
  device_type text NOT NULL DEFAULT 'ha-addon',
  local_ip text,
  ha_version text,
  addon_version text,
  latest_available_version text,
  last_heartbeat_at timestamptz,
  status text NOT NULL DEFAULT 'unknown',
  config jsonb NOT NULL DEFAULT '{}',
  offline_buffer_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- RLS
ALTER TABLE public.gateway_devices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant users can view their gateway devices"
  ON public.gateway_devices FOR SELECT TO authenticated
  USING (tenant_id = public.get_user_tenant_id());

CREATE POLICY "Admins can manage gateway devices"
  ON public.gateway_devices FOR ALL TO authenticated
  USING (tenant_id = public.get_user_tenant_id() AND public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (tenant_id = public.get_user_tenant_id() AND public.has_role(auth.uid(), 'admin'::app_role));

-- updated_at trigger
CREATE TRIGGER update_gateway_devices_updated_at
  BEFORE UPDATE ON public.gateway_devices
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Index for heartbeat lookups
CREATE INDEX idx_gateway_devices_tenant ON public.gateway_devices(tenant_id);
