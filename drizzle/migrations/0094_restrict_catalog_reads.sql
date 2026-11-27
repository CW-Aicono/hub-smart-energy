-- v1.45.5: replace USING (true) read policies on catalog tables with real predicates (repeat-safe)

DROP POLICY IF EXISTS "catalog read" ON public.pricing_package_modules;
DROP POLICY IF EXISTS "catalog read restricted" ON public.pricing_package_modules;
CREATE POLICY "catalog read restricted" ON public.pricing_package_modules
  FOR SELECT TO authenticated
  USING ((select public.can_read_price_catalog((select auth.uid()))));

DROP POLICY IF EXISTS "catalog read" ON public.module_catalog_flags;
DROP POLICY IF EXISTS "catalog read restricted" ON public.module_catalog_flags;
CREATE POLICY "catalog read restricted" ON public.module_catalog_flags
  FOR SELECT TO authenticated
  USING ((select public.can_read_price_catalog((select auth.uid()))));

DROP POLICY IF EXISTS "All authenticated users can read firmware catalog" ON public.cp_firmware_artifacts;
DROP POLICY IF EXISTS "Tenant staff and partners can read firmware catalog" ON public.cp_firmware_artifacts;
CREATE POLICY "Tenant staff and partners can read firmware catalog" ON public.cp_firmware_artifacts
  FOR SELECT TO authenticated
  USING (
    (select public.has_role((select auth.uid()), 'admin'::public.app_role))
    OR (select public.has_role((select auth.uid()), 'user'::public.app_role))
    OR (select public.is_partner_member((select auth.uid())))
  );

DROP POLICY IF EXISTS "Anyone authenticated can read templates" ON public.wallbox_modbus_templates;
DROP POLICY IF EXISTS "Tenant staff and partners can read templates" ON public.wallbox_modbus_templates;
CREATE POLICY "Tenant staff and partners can read templates" ON public.wallbox_modbus_templates
  FOR SELECT TO authenticated
  USING (
    (select public.has_role((select auth.uid()), 'admin'::public.app_role))
    OR (select public.has_role((select auth.uid()), 'user'::public.app_role))
    OR (select public.is_partner_member((select auth.uid())))
  );

-- Read only through the backend function (service role); portal_read and super admin policies remain.
DROP POLICY IF EXISTS "Authenticated users can read release channels" ON public.gateway_release_channels;

NOTIFY pgrst, 'reload schema';