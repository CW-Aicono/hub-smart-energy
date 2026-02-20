
-- PV Forecast Settings table
CREATE TABLE public.pv_forecast_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  location_id uuid NOT NULL REFERENCES public.locations(id) ON DELETE CASCADE,
  pv_meter_id uuid REFERENCES public.meters(id) ON DELETE SET NULL,
  peak_power_kwp numeric NOT NULL DEFAULT 10,
  tilt_deg numeric DEFAULT 30,
  azimuth_deg numeric DEFAULT 180,
  is_active boolean DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(tenant_id, location_id)
);

ALTER TABLE public.pv_forecast_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own tenant pv_forecast_settings"
  ON public.pv_forecast_settings FOR SELECT
  USING (tenant_id = public.get_user_tenant_id());

CREATE POLICY "Admins can insert pv_forecast_settings"
  ON public.pv_forecast_settings FOR INSERT
  WITH CHECK (tenant_id = public.get_user_tenant_id() AND public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update pv_forecast_settings"
  ON public.pv_forecast_settings FOR UPDATE
  USING (tenant_id = public.get_user_tenant_id() AND public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete pv_forecast_settings"
  ON public.pv_forecast_settings FOR DELETE
  USING (tenant_id = public.get_user_tenant_id() AND public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER update_pv_forecast_settings_updated_at
  BEFORE UPDATE ON public.pv_forecast_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
