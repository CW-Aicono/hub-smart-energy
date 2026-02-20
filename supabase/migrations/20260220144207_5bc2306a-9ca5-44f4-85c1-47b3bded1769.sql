
-- Update the RLS policy for tenant electricity app users to also check junction table
DROP POLICY IF EXISTS "App tenants can view own meter" ON public.meters;

CREATE POLICY "App tenants can view own meter" ON public.meters
  FOR SELECT
  USING (
    -- Legacy single meter_id
    (EXISTS (
      SELECT 1 FROM tenant_electricity_tenants tet
      WHERE tet.meter_id = meters.id AND tet.auth_user_id = auth.uid() AND tet.status = 'active'
    ))
    OR
    -- New junction table
    (EXISTS (
      SELECT 1 FROM tenant_electricity_tenant_meters tetm
      JOIN tenant_electricity_tenants tet ON tet.id = tetm.tenant_electricity_tenant_id
      WHERE tetm.meter_id = meters.id AND tet.auth_user_id = auth.uid() AND tet.status = 'active'
    ))
  );
