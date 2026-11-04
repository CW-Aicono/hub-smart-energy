INSERT INTO public.pricing_package_modules (package_code,module_code) VALUES ('p1_monitoring','task_management'),('p3_automation','automation_building') ON CONFLICT DO NOTHING;
CREATE OR REPLACE FUNCTION public.effective_tenant_modules(p_tenant uuid)
 RETURNS TABLE(module_code text, is_enabled boolean, valid_until date)
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$ BEGIN
IF NOT (coalesce(auth.role(),'')='service_role'
  OR coalesce(can_portal_read(auth.uid(),'commercial'),false)
  OR coalesce(can_manage_partner_billing((SELECT partner_id FROM tenants WHERE id=p_tenant)),false)
  OR EXISTS(SELECT 1 FROM profiles WHERE (user_id=auth.uid() OR id=auth.uid()) AND tenant_id=p_tenant)
  OR EXISTS(SELECT 1 FROM support_sessions WHERE super_admin_user_id=auth.uid() AND tenant_id=p_tenant AND ended_at IS NULL)) THEN
  RAISE EXCEPTION 'Keine Berechtigung';
END IF;
RETURN QUERY WITH coverage AS (SELECT s.ended_on,m.module_code code FROM license_sales s CROSS JOIN LATERAL (SELECT pm.module_code FROM pricing_package_modules pm WHERE s.product_kind='package' AND pm.package_code=s.product_code UNION SELECT unnest(CASE WHEN s.product_kind='unit' AND s.product_code='charge_point' THEN ARRAY['ev_charging','adhoc_payment'] WHEN s.product_kind='unit' AND s.product_code='extra_location' THEN ARRAY['locations'] WHEN s.product_kind='unit' AND s.product_code='remote_support' THEN ARRAY['remote_support'] ELSE ARRAY[]::text[] END)) m WHERE s.tenant_id=p_tenant), permanent AS (SELECT pm.module_code code FROM tenant_package_bookings b JOIN pricing_package_modules pm ON pm.package_code=b.package_code WHERE b.tenant_id=p_tenant AND b.cancelled_at IS NULL UNION SELECT pm.module_code FROM pricing_packages p JOIN pricing_package_modules pm ON pm.package_code=p.code WHERE p.always_active)
SELECT tm.module_code,tm.is_enabled AND (coalesce(tm.individual_grant,false) OR EXISTS(SELECT 1 FROM permanent p WHERE p.code=tm.module_code) OR NOT EXISTS(SELECT 1 FROM coverage c WHERE c.code=tm.module_code) OR EXISTS(SELECT 1 FROM coverage c WHERE c.code=tm.module_code AND (c.ended_on IS NULL OR c.ended_on >= (now() AT TIME ZONE 'Europe/Berlin')::date))),CASE WHEN coalesce(tm.individual_grant,false) OR EXISTS(SELECT 1 FROM permanent p WHERE p.code=tm.module_code) OR NOT EXISTS(SELECT 1 FROM coverage c WHERE c.code=tm.module_code) OR EXISTS(SELECT 1 FROM coverage c WHERE c.code=tm.module_code AND c.ended_on IS NULL) THEN NULL ELSE (SELECT max(c.ended_on) FROM coverage c WHERE c.code=tm.module_code) END FROM tenant_modules tm WHERE tm.tenant_id=p_tenant;
END $function$;
REVOKE ALL ON FUNCTION public.effective_tenant_modules(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.effective_tenant_modules(uuid) TO authenticated, service_role;