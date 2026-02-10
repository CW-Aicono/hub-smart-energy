
-- charge_points table
CREATE TABLE public.charge_points (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  location_id UUID REFERENCES public.locations(id) ON DELETE SET NULL,
  ocpp_id TEXT NOT NULL,
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'offline',
  connector_count INTEGER NOT NULL DEFAULT 1,
  max_power_kw NUMERIC NOT NULL DEFAULT 22,
  last_heartbeat TIMESTAMP WITH TIME ZONE,
  firmware_version TEXT,
  vendor TEXT,
  model TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(tenant_id, ocpp_id)
);

ALTER TABLE public.charge_points ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view charge points in their tenant"
  ON public.charge_points FOR SELECT
  USING (tenant_id = get_user_tenant_id());

CREATE POLICY "Admins can insert charge points"
  ON public.charge_points FOR INSERT
  WITH CHECK (tenant_id = get_user_tenant_id() AND has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can update charge points"
  ON public.charge_points FOR UPDATE
  USING (tenant_id = get_user_tenant_id() AND has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can delete charge points"
  ON public.charge_points FOR DELETE
  USING (tenant_id = get_user_tenant_id() AND has_role(auth.uid(), 'admin'::app_role));

-- charging_sessions table
CREATE TABLE public.charging_sessions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  charge_point_id UUID NOT NULL REFERENCES public.charge_points(id) ON DELETE CASCADE,
  connector_id INTEGER NOT NULL DEFAULT 1,
  transaction_id INTEGER,
  id_tag TEXT,
  start_time TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  stop_time TIMESTAMP WITH TIME ZONE,
  energy_kwh NUMERIC NOT NULL DEFAULT 0,
  meter_start NUMERIC,
  meter_stop NUMERIC,
  stop_reason TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.charging_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view charging sessions in their tenant"
  ON public.charging_sessions FOR SELECT
  USING (tenant_id = get_user_tenant_id());

CREATE POLICY "Admins can insert charging sessions"
  ON public.charging_sessions FOR INSERT
  WITH CHECK (tenant_id = get_user_tenant_id() AND has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can update charging sessions"
  ON public.charging_sessions FOR UPDATE
  USING (tenant_id = get_user_tenant_id() AND has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can delete charging sessions"
  ON public.charging_sessions FOR DELETE
  USING (tenant_id = get_user_tenant_id() AND has_role(auth.uid(), 'admin'::app_role));

-- charging_tariffs table
CREATE TABLE public.charging_tariffs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  price_per_kwh NUMERIC NOT NULL DEFAULT 0,
  base_fee NUMERIC NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'EUR',
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.charging_tariffs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view charging tariffs in their tenant"
  ON public.charging_tariffs FOR SELECT
  USING (tenant_id = get_user_tenant_id());

CREATE POLICY "Admins can insert charging tariffs"
  ON public.charging_tariffs FOR INSERT
  WITH CHECK (tenant_id = get_user_tenant_id() AND has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can update charging tariffs"
  ON public.charging_tariffs FOR UPDATE
  USING (tenant_id = get_user_tenant_id() AND has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can delete charging tariffs"
  ON public.charging_tariffs FOR DELETE
  USING (tenant_id = get_user_tenant_id() AND has_role(auth.uid(), 'admin'::app_role));

-- charging_invoices table
CREATE TABLE public.charging_invoices (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  session_id UUID NOT NULL REFERENCES public.charging_sessions(id) ON DELETE CASCADE,
  tariff_id UUID REFERENCES public.charging_tariffs(id) ON DELETE SET NULL,
  total_energy_kwh NUMERIC NOT NULL DEFAULT 0,
  total_amount NUMERIC NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'EUR',
  status TEXT NOT NULL DEFAULT 'draft',
  invoice_number TEXT,
  issued_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.charging_invoices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view charging invoices in their tenant"
  ON public.charging_invoices FOR SELECT
  USING (tenant_id = get_user_tenant_id());

CREATE POLICY "Admins can insert charging invoices"
  ON public.charging_invoices FOR INSERT
  WITH CHECK (tenant_id = get_user_tenant_id() AND has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can update charging invoices"
  ON public.charging_invoices FOR UPDATE
  USING (tenant_id = get_user_tenant_id() AND has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can delete charging invoices"
  ON public.charging_invoices FOR DELETE
  USING (tenant_id = get_user_tenant_id() AND has_role(auth.uid(), 'admin'::app_role));

-- Enable realtime for live status updates
ALTER PUBLICATION supabase_realtime ADD TABLE public.charge_points;
ALTER PUBLICATION supabase_realtime ADD TABLE public.charging_sessions;

-- Update trigger for charge_points
CREATE TRIGGER update_charge_points_updated_at
  BEFORE UPDATE ON public.charge_points
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Update trigger for charging_tariffs
CREATE TRIGGER update_charging_tariffs_updated_at
  BEFORE UPDATE ON public.charging_tariffs
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
