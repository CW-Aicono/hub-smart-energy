
-- =========================================================
-- integration_errors
-- =========================================================
DROP POLICY IF EXISTS "Partner members can read tenant data" ON public.integration_errors;
CREATE POLICY "Partner members can read tenant data" ON public.integration_errors
  FOR SELECT TO authenticated
  USING (public.partner_has_tenant_access((SELECT auth.uid()), tenant_id));

DROP POLICY IF EXISTS "Users can update own tenant integration errors" ON public.integration_errors;
CREATE POLICY "Users can update own tenant integration errors" ON public.integration_errors
  FOR UPDATE TO authenticated
  USING (tenant_id = (SELECT public.get_user_tenant_id()))
  WITH CHECK (tenant_id = (SELECT public.get_user_tenant_id()));

DROP POLICY IF EXISTS "Users can view own tenant integration errors" ON public.integration_errors;
CREATE POLICY "Users can view own tenant integration errors" ON public.integration_errors
  FOR SELECT TO authenticated
  USING (tenant_id = (SELECT public.get_user_tenant_id()));

-- =========================================================
-- location_integrations
-- =========================================================
DROP POLICY IF EXISTS "Admins can create location integrations" ON public.location_integrations;
CREATE POLICY "Admins can create location integrations" ON public.location_integrations
  FOR INSERT
  WITH CHECK (
    (EXISTS (SELECT 1 FROM public.locations l
              WHERE l.id = location_integrations.location_id
                AND l.tenant_id = (SELECT public.get_user_tenant_id())))
    AND public.has_role((SELECT auth.uid()), 'admin'::app_role)
  );

DROP POLICY IF EXISTS "Admins can delete location integrations" ON public.location_integrations;
CREATE POLICY "Admins can delete location integrations" ON public.location_integrations
  FOR DELETE
  USING (
    (EXISTS (SELECT 1 FROM public.locations l
              WHERE l.id = location_integrations.location_id
                AND l.tenant_id = (SELECT public.get_user_tenant_id())))
    AND public.has_role((SELECT auth.uid()), 'admin'::app_role)
  );

DROP POLICY IF EXISTS "Admins can update location integrations" ON public.location_integrations;
CREATE POLICY "Admins can update location integrations" ON public.location_integrations
  FOR UPDATE
  USING (
    (EXISTS (SELECT 1 FROM public.locations l
              WHERE l.id = location_integrations.location_id
                AND l.tenant_id = (SELECT public.get_user_tenant_id())))
    AND public.has_role((SELECT auth.uid()), 'admin'::app_role)
  );

DROP POLICY IF EXISTS "Super admins can view all location integrations" ON public.location_integrations;
CREATE POLICY "Super admins can view all location integrations" ON public.location_integrations
  FOR SELECT
  USING (public.has_role((SELECT auth.uid()), 'super_admin'::app_role));

DROP POLICY IF EXISTS "Users can view location integrations from their tenant" ON public.location_integrations;
CREATE POLICY "Users can view location integrations from their tenant" ON public.location_integrations
  FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.locations l
     WHERE l.id = location_integrations.location_id
       AND l.tenant_id = (SELECT public.get_user_tenant_id())
  ));

-- =========================================================
-- meter_period_totals
-- =========================================================
DROP POLICY IF EXISTS "App tenants can view own meter period totals" ON public.meter_period_totals;
CREATE POLICY "App tenants can view own meter period totals" ON public.meter_period_totals
  FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.tenant_electricity_tenants tet
     WHERE tet.meter_id = meter_period_totals.meter_id
       AND tet.auth_user_id = (SELECT auth.uid())
       AND tet.status = 'active'
  ));

DROP POLICY IF EXISTS "Partner members can read tenant data" ON public.meter_period_totals;
CREATE POLICY "Partner members can read tenant data" ON public.meter_period_totals
  FOR SELECT TO authenticated
  USING (public.partner_has_tenant_access((SELECT auth.uid()), tenant_id));

DROP POLICY IF EXISTS "Tenant users can manage period totals" ON public.meter_period_totals;
CREATE POLICY "Tenant users can manage period totals" ON public.meter_period_totals
  FOR ALL
  USING (tenant_id = (SELECT public.get_user_tenant_id()))
  WITH CHECK (tenant_id = (SELECT public.get_user_tenant_id()));

-- =========================================================
-- meter_power_readings
-- =========================================================
DROP POLICY IF EXISTS "Partner members can read tenant data" ON public.meter_power_readings;
CREATE POLICY "Partner members can read tenant data" ON public.meter_power_readings
  FOR SELECT TO authenticated
  USING (public.partner_has_tenant_access((SELECT auth.uid()), tenant_id));

DROP POLICY IF EXISTS "Tenant users can manage power readings" ON public.meter_power_readings;
CREATE POLICY "Tenant users can manage power readings" ON public.meter_power_readings
  FOR ALL
  USING (tenant_id = (SELECT public.get_user_tenant_id()))
  WITH CHECK (tenant_id = (SELECT public.get_user_tenant_id()));

-- =========================================================
-- meter_power_readings_5min
-- =========================================================
DROP POLICY IF EXISTS "Partner members can read tenant data" ON public.meter_power_readings_5min;
CREATE POLICY "Partner members can read tenant data" ON public.meter_power_readings_5min
  FOR SELECT TO authenticated
  USING (public.partner_has_tenant_access((SELECT auth.uid()), tenant_id));

DROP POLICY IF EXISTS "Tenant users can delete 5min readings" ON public.meter_power_readings_5min;
CREATE POLICY "Tenant users can delete 5min readings" ON public.meter_power_readings_5min
  FOR DELETE
  USING (tenant_id = (SELECT public.get_user_tenant_id()));

DROP POLICY IF EXISTS "Tenant users can insert 5min readings" ON public.meter_power_readings_5min;
CREATE POLICY "Tenant users can insert 5min readings" ON public.meter_power_readings_5min
  FOR INSERT
  WITH CHECK (tenant_id = (SELECT public.get_user_tenant_id()));

DROP POLICY IF EXISTS "Tenant users can view 5min readings" ON public.meter_power_readings_5min;
CREATE POLICY "Tenant users can view 5min readings" ON public.meter_power_readings_5min
  FOR SELECT
  USING (tenant_id = (SELECT public.get_user_tenant_id()));

-- =========================================================
-- meters
-- =========================================================
DROP POLICY IF EXISTS "App tenants can view own meter" ON public.meters;
CREATE POLICY "App tenants can view own meter" ON public.meters
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.tenant_electricity_tenants tet
       WHERE tet.meter_id = meters.id
         AND tet.auth_user_id = (SELECT auth.uid())
         AND tet.status = 'active'
    )
    OR EXISTS (
      SELECT 1 FROM public.tenant_electricity_tenant_meters tetm
        JOIN public.tenant_electricity_tenants tet
          ON tet.id = tetm.tenant_electricity_tenant_id
       WHERE tetm.meter_id = meters.id
         AND tet.auth_user_id = (SELECT auth.uid())
         AND tet.status = 'active'
    )
  );

DROP POLICY IF EXISTS "Partner members can read tenant data" ON public.meters;
CREATE POLICY "Partner members can read tenant data" ON public.meters
  FOR SELECT TO authenticated
  USING (public.partner_has_tenant_access((SELECT auth.uid()), tenant_id));

DROP POLICY IF EXISTS "Super admins can view all meters" ON public.meters;
CREATE POLICY "Super admins can view all meters" ON public.meters
  FOR SELECT TO authenticated
  USING (public.has_role((SELECT auth.uid()), 'super_admin'::app_role));

DROP POLICY IF EXISTS "Users can delete meters in their tenant" ON public.meters;
CREATE POLICY "Users can delete meters in their tenant" ON public.meters
  FOR DELETE
  USING (tenant_id = (SELECT public.get_user_tenant_id()));

DROP POLICY IF EXISTS "Users can insert meters in their tenant" ON public.meters;
CREATE POLICY "Users can insert meters in their tenant" ON public.meters
  FOR INSERT
  WITH CHECK (tenant_id = (SELECT public.get_user_tenant_id()));

DROP POLICY IF EXISTS "Users can update meters in their tenant" ON public.meters;
CREATE POLICY "Users can update meters in their tenant" ON public.meters
  FOR UPDATE
  USING (tenant_id = (SELECT public.get_user_tenant_id()));

DROP POLICY IF EXISTS "Users can view meters in their tenant" ON public.meters;
CREATE POLICY "Users can view meters in their tenant" ON public.meters
  FOR SELECT
  USING (tenant_id = (SELECT public.get_user_tenant_id()));
