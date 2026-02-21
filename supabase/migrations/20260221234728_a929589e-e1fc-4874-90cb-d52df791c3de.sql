
CREATE TABLE public.tenant_self_tariffs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_electricity_tenant_id UUID NOT NULL REFERENCES public.tenant_electricity_tenants(id) ON DELETE CASCADE,
  energy_type TEXT NOT NULL DEFAULT 'strom',
  price_per_kwh NUMERIC NOT NULL DEFAULT 0,
  base_fee_monthly NUMERIC NOT NULL DEFAULT 0,
  provider_name TEXT,
  valid_from DATE NOT NULL DEFAULT CURRENT_DATE,
  valid_until DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.tenant_self_tariffs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenants can view own tariffs"
  ON public.tenant_self_tariffs FOR SELECT
  USING (tenant_electricity_tenant_id IN (
    SELECT id FROM public.tenant_electricity_tenants WHERE auth_user_id = auth.uid()
  ));

CREATE POLICY "Tenants can create own tariffs"
  ON public.tenant_self_tariffs FOR INSERT
  WITH CHECK (tenant_electricity_tenant_id IN (
    SELECT id FROM public.tenant_electricity_tenants WHERE auth_user_id = auth.uid()
  ));

CREATE POLICY "Tenants can update own tariffs"
  ON public.tenant_self_tariffs FOR UPDATE
  USING (tenant_electricity_tenant_id IN (
    SELECT id FROM public.tenant_electricity_tenants WHERE auth_user_id = auth.uid()
  ));

CREATE POLICY "Tenants can delete own tariffs"
  ON public.tenant_self_tariffs FOR DELETE
  USING (tenant_electricity_tenant_id IN (
    SELECT id FROM public.tenant_electricity_tenants WHERE auth_user_id = auth.uid()
  ));

CREATE POLICY "Admins can view tenant self tariffs"
  ON public.tenant_self_tariffs FOR SELECT
  USING (tenant_electricity_tenant_id IN (
    SELECT id FROM public.tenant_electricity_tenants WHERE tenant_id = get_user_tenant_id()
  ));

DROP TRIGGER IF EXISTS update_tenant_self_tariffs_updated_at ON public.tenant_self_tariffs;
CREATE TRIGGER update_tenant_self_tariffs_updated_at
  BEFORE UPDATE ON public.tenant_self_tariffs
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
