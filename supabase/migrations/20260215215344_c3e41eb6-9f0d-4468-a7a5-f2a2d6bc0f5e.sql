
CREATE TABLE public.meter_period_totals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id),
  meter_id UUID NOT NULL REFERENCES public.meters(id) ON DELETE CASCADE,
  period_type TEXT NOT NULL CHECK (period_type IN ('month', 'year')),
  period_start DATE NOT NULL,
  total_value NUMERIC NOT NULL,
  energy_type TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'loxone',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(meter_id, period_type, period_start)
);

ALTER TABLE public.meter_period_totals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant users can manage period totals"
  ON public.meter_period_totals
  FOR ALL USING (tenant_id = get_user_tenant_id());

CREATE TRIGGER update_meter_period_totals_updated_at
  BEFORE UPDATE ON public.meter_period_totals
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
