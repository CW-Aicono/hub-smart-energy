-- Fail closed if the package/entitlement stack is incomplete or still contains known live bugs.
SELECT to_regclass('public.license_sales') IS NOT NULL
  AND to_regclass('public.pricing_package_modules') IS NOT NULL
  AND to_regclass('public.tenant_package_bookings') IS NOT NULL
  AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='tenant_modules' AND column_name='individual_grant')
  AND EXISTS (SELECT 1 FROM public.pricing_package_modules)
  AND (SELECT count(DISTINCT proname) FROM pg_proc WHERE pronamespace='public'::regnamespace
       AND proname IN ('effective_tenant_modules','preflight_license_sale','can_manage_partner_billing','can_portal_read','bill_catalog_license_sale')) = 5
  AND pg_get_functiondef(to_regprocedure('public.effective_tenant_modules(uuid)')) LIKE '%super_admin_user_id=auth.uid()%'
  AND pg_get_functiondef(to_regprocedure('public.effective_tenant_modules(uuid)')) LIKE '%user_id=auth.uid() OR id=auth.uid()%';
