
CREATE TABLE public.grid_operator_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  location_id UUID NOT NULL REFERENCES public.locations(id) ON DELETE CASCADE,
  module TEXT NOT NULL DEFAULT 'modul1' CHECK (module IN ('modul1','modul2','modul3')),
  dso_name TEXT NOT NULL,
  connection_id TEXT,
  webhook_secret TEXT NOT NULL DEFAULT encode(gen_random_bytes(24), 'hex'),
  active BOOLEAN NOT NULL DEFAULT true,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(location_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.grid_operator_connections TO authenticated;
GRANT ALL ON public.grid_operator_connections TO service_role;
ALTER TABLE public.grid_operator_connections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant members can view grid connections"
  ON public.grid_operator_connections FOR SELECT TO authenticated
  USING ((tenant_id = get_user_tenant_id()) OR has_role(auth.uid(), 'super_admin'));

CREATE POLICY "Tenant admins can modify grid connections"
  ON public.grid_operator_connections FOR ALL TO authenticated
  USING (((tenant_id = get_user_tenant_id()) AND has_role(auth.uid(), 'admin')) OR has_role(auth.uid(), 'super_admin'))
  WITH CHECK (((tenant_id = get_user_tenant_id()) AND has_role(auth.uid(), 'admin')) OR has_role(auth.uid(), 'super_admin'));

CREATE TABLE public.grid_curtailment_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  connection_id UUID NOT NULL REFERENCES public.grid_operator_connections(id) ON DELETE CASCADE,
  received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  valid_from TIMESTAMPTZ NOT NULL,
  valid_until TIMESTAMPTZ NOT NULL,
  curtailment_percent INT NOT NULL CHECK (curtailment_percent BETWEEN 0 AND 100),
  source TEXT NOT NULL DEFAULT 'webhook' CHECK (source IN ('webhook','manual','cron')),
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  applied_at TIMESTAMPTZ,
  applied_result JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX grid_curtailment_events_conn_idx ON public.grid_curtailment_events(connection_id, valid_from DESC);
CREATE INDEX grid_curtailment_events_active_idx ON public.grid_curtailment_events(connection_id, valid_until DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.grid_curtailment_events TO authenticated;
GRANT ALL ON public.grid_curtailment_events TO service_role;
ALTER TABLE public.grid_curtailment_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant members can view curtailment events"
  ON public.grid_curtailment_events FOR SELECT TO authenticated
  USING ((tenant_id = get_user_tenant_id()) OR has_role(auth.uid(), 'super_admin'));

CREATE POLICY "Tenant admins can insert manual curtailment events"
  ON public.grid_curtailment_events FOR INSERT TO authenticated
  WITH CHECK (
    source = 'manual' AND (
      ((tenant_id = get_user_tenant_id()) AND has_role(auth.uid(), 'admin'))
      OR has_role(auth.uid(), 'super_admin')
    )
  );

CREATE TABLE public.steuve_devices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  connection_id UUID NOT NULL REFERENCES public.grid_operator_connections(id) ON DELETE CASCADE,
  device_type TEXT NOT NULL DEFAULT 'charge_point' CHECK (device_type IN ('charge_point','heat_pump','battery')),
  device_ref_id UUID NOT NULL,
  min_power_kw NUMERIC(6,2) NOT NULL DEFAULT 4.2,
  priority INT NOT NULL DEFAULT 100,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(connection_id, device_type, device_ref_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.steuve_devices TO authenticated;
GRANT ALL ON public.steuve_devices TO service_role;
ALTER TABLE public.steuve_devices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant members can view steuve devices"
  ON public.steuve_devices FOR SELECT TO authenticated
  USING ((tenant_id = get_user_tenant_id()) OR has_role(auth.uid(), 'super_admin'));

CREATE POLICY "Tenant admins can modify steuve devices"
  ON public.steuve_devices FOR ALL TO authenticated
  USING (((tenant_id = get_user_tenant_id()) AND has_role(auth.uid(), 'admin')) OR has_role(auth.uid(), 'super_admin'))
  WITH CHECK (((tenant_id = get_user_tenant_id()) AND has_role(auth.uid(), 'admin')) OR has_role(auth.uid(), 'super_admin'));

CREATE TRIGGER trg_grid_operator_connections_updated_at BEFORE UPDATE ON public.grid_operator_connections
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_steuve_devices_updated_at BEFORE UPDATE ON public.steuve_devices
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER PUBLICATION supabase_realtime ADD TABLE public.grid_operator_connections;
ALTER PUBLICATION supabase_realtime ADD TABLE public.grid_curtailment_events;
ALTER PUBLICATION supabase_realtime ADD TABLE public.steuve_devices;
