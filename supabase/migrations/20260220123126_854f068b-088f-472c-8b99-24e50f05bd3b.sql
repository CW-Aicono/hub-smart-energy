
-- Junction table for tenant <-> meter (many-to-many)
CREATE TABLE public.tenant_electricity_tenant_meters (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_electricity_tenant_id UUID NOT NULL REFERENCES public.tenant_electricity_tenants(id) ON DELETE CASCADE,
  meter_id UUID NOT NULL REFERENCES public.meters(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(tenant_electricity_tenant_id, meter_id)
);

ALTER TABLE public.tenant_electricity_tenant_meters ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view tenant meters in their tenant"
ON public.tenant_electricity_tenant_meters FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM tenant_electricity_tenants t
    WHERE t.id = tenant_electricity_tenant_meters.tenant_electricity_tenant_id
      AND t.tenant_id = get_user_tenant_id()
  )
);

CREATE POLICY "Users can insert tenant meters in their tenant"
ON public.tenant_electricity_tenant_meters FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM tenant_electricity_tenants t
    WHERE t.id = tenant_electricity_tenant_meters.tenant_electricity_tenant_id
      AND t.tenant_id = get_user_tenant_id()
  )
);

CREATE POLICY "Users can delete tenant meters in their tenant"
ON public.tenant_electricity_tenant_meters FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM tenant_electricity_tenants t
    WHERE t.id = tenant_electricity_tenant_meters.tenant_electricity_tenant_id
      AND t.tenant_id = get_user_tenant_id()
  )
);

-- Migrate existing meter_id data to junction table
INSERT INTO public.tenant_electricity_tenant_meters (tenant_electricity_tenant_id, meter_id)
SELECT id, meter_id FROM public.tenant_electricity_tenants WHERE meter_id IS NOT NULL
ON CONFLICT DO NOTHING;
