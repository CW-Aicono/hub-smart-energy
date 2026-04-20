
-- Solar charging configuration per location
CREATE TABLE public.solar_charging_config (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  location_id UUID NOT NULL REFERENCES public.locations(id) ON DELETE CASCADE,
  reference_meter_id UUID REFERENCES public.meters(id) ON DELETE SET NULL,
  min_charge_power_w INTEGER NOT NULL DEFAULT 1400,
  safety_buffer_w INTEGER NOT NULL DEFAULT 200,
  priority_mode TEXT NOT NULL DEFAULT 'equal_split',
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, location_id)
);

ALTER TABLE public.solar_charging_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant members can view solar charging config"
  ON public.solar_charging_config FOR SELECT
  USING (tenant_id = public.get_user_tenant_id());

CREATE POLICY "Tenant members can insert solar charging config"
  ON public.solar_charging_config FOR INSERT
  WITH CHECK (tenant_id = public.get_user_tenant_id());

CREATE POLICY "Tenant members can update solar charging config"
  ON public.solar_charging_config FOR UPDATE
  USING (tenant_id = public.get_user_tenant_id());

CREATE POLICY "Tenant members can delete solar charging config"
  ON public.solar_charging_config FOR DELETE
  USING (tenant_id = public.get_user_tenant_id());

CREATE TRIGGER update_solar_charging_config_updated_at
  BEFORE UPDATE ON public.solar_charging_config
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Add charging_mode to connectors
ALTER TABLE public.charge_point_connectors
  ADD COLUMN charging_mode TEXT NOT NULL DEFAULT 'immediate';

-- Solar charging execution log
CREATE TABLE public.solar_charging_log (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  location_id UUID NOT NULL REFERENCES public.locations(id) ON DELETE CASCADE,
  surplus_w DOUBLE PRECISION,
  allocated_w DOUBLE PRECISION,
  active_connectors INTEGER DEFAULT 0,
  actions_taken JSONB,
  status TEXT NOT NULL DEFAULT 'success',
  error_message TEXT,
  executed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.solar_charging_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant members can view solar charging log"
  ON public.solar_charging_log FOR SELECT
  USING (tenant_id = public.get_user_tenant_id());

CREATE POLICY "Service role can insert solar charging log"
  ON public.solar_charging_log FOR INSERT
  WITH CHECK (true);
