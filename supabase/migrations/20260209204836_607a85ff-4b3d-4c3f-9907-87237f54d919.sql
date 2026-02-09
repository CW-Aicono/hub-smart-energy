
-- Create meters table for vendor-independent meter management
CREATE TABLE public.meters (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  location_id UUID NOT NULL REFERENCES public.locations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  meter_number TEXT,
  energy_type TEXT NOT NULL DEFAULT 'strom',
  unit TEXT NOT NULL DEFAULT 'kWh',
  medium TEXT,
  installation_date DATE,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.meters ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view meters in their tenant"
  ON public.meters FOR SELECT
  USING (tenant_id = public.get_user_tenant_id());

CREATE POLICY "Users can insert meters in their tenant"
  ON public.meters FOR INSERT
  WITH CHECK (tenant_id = public.get_user_tenant_id());

CREATE POLICY "Users can update meters in their tenant"
  ON public.meters FOR UPDATE
  USING (tenant_id = public.get_user_tenant_id());

CREATE POLICY "Users can delete meters in their tenant"
  ON public.meters FOR DELETE
  USING (tenant_id = public.get_user_tenant_id());

CREATE TRIGGER update_meters_updated_at
  BEFORE UPDATE ON public.meters
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Create alert_rules table for threshold configuration
CREATE TABLE public.alert_rules (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  location_id UUID REFERENCES public.locations(id) ON DELETE CASCADE,
  meter_id UUID REFERENCES public.meters(id) ON DELETE CASCADE,
  energy_type TEXT NOT NULL DEFAULT 'strom',
  threshold_value NUMERIC NOT NULL,
  threshold_type TEXT NOT NULL DEFAULT 'above' CHECK (threshold_type IN ('above', 'below')),
  notification_email TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  name TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.alert_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view alert rules in their tenant"
  ON public.alert_rules FOR SELECT
  USING (tenant_id = public.get_user_tenant_id());

CREATE POLICY "Users can insert alert rules in their tenant"
  ON public.alert_rules FOR INSERT
  WITH CHECK (tenant_id = public.get_user_tenant_id());

CREATE POLICY "Users can update alert rules in their tenant"
  ON public.alert_rules FOR UPDATE
  USING (tenant_id = public.get_user_tenant_id());

CREATE POLICY "Users can delete alert rules in their tenant"
  ON public.alert_rules FOR DELETE
  USING (tenant_id = public.get_user_tenant_id());

CREATE TRIGGER update_alert_rules_updated_at
  BEFORE UPDATE ON public.alert_rules
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
