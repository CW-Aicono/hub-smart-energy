
-- Add auth_user_id to tenant_electricity_tenants so tenants can self-register
ALTER TABLE public.tenant_electricity_tenants
ADD COLUMN IF NOT EXISTS auth_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;

-- Index for fast lookup
CREATE INDEX IF NOT EXISTS idx_te_tenants_auth_user_id ON public.tenant_electricity_tenants(auth_user_id);

-- RLS: Allow tenant electricity tenants to view their own record
CREATE POLICY "App tenants can view own record"
ON public.tenant_electricity_tenants
FOR SELECT
USING (auth_user_id = auth.uid());

-- RLS: Allow tenant electricity tenants to view invoices for themselves
CREATE POLICY "App tenants can view own invoices"
ON public.tenant_electricity_invoices
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.tenant_electricity_tenants tet
    WHERE tet.id = tenant_electricity_invoices.tenant_electricity_tenant_id
    AND tet.auth_user_id = auth.uid()
    AND tet.status = 'active'
  )
);

-- RLS: Allow app tenants to view tariffs related to their invoices
CREATE POLICY "App tenants can view related tariffs"
ON public.tenant_electricity_tariffs
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.tenant_electricity_tenants tet
    WHERE tet.tenant_id = tenant_electricity_tariffs.tenant_id
    AND tet.auth_user_id = auth.uid()
    AND tet.status = 'active'
  )
);

-- RLS: Allow app tenants to view readings for their meters
CREATE POLICY "App tenants can view own readings"
ON public.tenant_electricity_readings
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.tenant_electricity_tenants tet
    WHERE tet.id = tenant_electricity_readings.tenant_electricity_tenant_id
    AND tet.auth_user_id = auth.uid()
    AND tet.status = 'active'
  )
);

-- RLS: Allow app tenants to view meter_readings for their assigned meter
CREATE POLICY "App tenants can view own meter readings"
ON public.meter_readings
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.tenant_electricity_tenants tet
    WHERE tet.meter_id = meter_readings.meter_id
    AND tet.auth_user_id = auth.uid()
    AND tet.status = 'active'
  )
);

-- RLS: Allow app tenants to view their assigned meter
CREATE POLICY "App tenants can view own meter"
ON public.meters
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.tenant_electricity_tenants tet
    WHERE tet.meter_id = meters.id
    AND tet.auth_user_id = auth.uid()
    AND tet.status = 'active'
  )
);

-- RLS: Allow app tenants to view meter_period_totals for their meter
CREATE POLICY "App tenants can view own meter period totals"
ON public.meter_period_totals
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.tenant_electricity_tenants tet
    WHERE tet.meter_id = meter_period_totals.meter_id
    AND tet.auth_user_id = auth.uid()
    AND tet.status = 'active'
  )
);
