ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'portal_commercial';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'portal_technical';

CREATE OR REPLACE FUNCTION public.portal_roles(_uid uuid)
RETURNS text[] LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce(array_agg(role::text), '{}') FROM public.user_roles
  WHERE user_id = _uid AND role::text IN ('super_admin','portal_commercial','portal_technical')
$$;

CREATE OR REPLACE FUNCTION public.is_portal_member(_uid uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT cardinality(public.portal_roles(_uid)) > 0
$$;

CREATE OR REPLACE FUNCTION public.can_portal_write(_uid uuid, _area text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE
    WHEN 'super_admin' = ANY(r) THEN true
    WHEN _area IN ('overview','commercial') AND 'portal_commercial' = ANY(r) THEN true
    WHEN _area IN ('technical','roadmap') AND 'portal_technical' = ANY(r) THEN true
    ELSE false END
  FROM (SELECT public.portal_roles(_uid) AS r) s
$$;

CREATE OR REPLACE FUNCTION public.can_portal_read(_uid uuid, _area text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.can_portal_write(_uid, _area)
      OR (_area IN ('overview','roadmap') AND public.is_portal_member(_uid))
$$;

REVOKE EXECUTE ON FUNCTION public.portal_roles(uuid), public.is_portal_member(uuid),
  public.can_portal_write(uuid,text), public.can_portal_read(uuid,text) FROM anon;
GRANT EXECUTE ON FUNCTION public.portal_roles(uuid), public.is_portal_member(uuid),
  public.can_portal_write(uuid,text), public.can_portal_read(uuid,text) TO authenticated;

DO $$
DECLARE
  rec record;
BEGIN
  FOR rec IN SELECT * FROM (VALUES
    ('tenants','overview'),('partners','overview'),('partner_members','overview'),
    ('partner_modules','overview'),('tenant_partner_transfers','overview'),
    ('platform_statistics','overview'),('platform_metrics','overview'),
    ('board_templates','overview'),('board_themes','overview'),
    ('device_catalog','overview'),('device_catalog_partner_pricing','overview'),
    ('device_compatibility','overview'),('device_selection_rules','overview'),
    ('roadmap_items','roadmap'),('roadmap_item_history','roadmap'),
    ('tenant_invoices','commercial'),('tenant_licenses','commercial'),
    ('tenant_modules','commercial'),('tenant_module_discounts','commercial'),
    ('tenant_bundles','commercial'),('module_prices','commercial'),
    ('module_bundles','commercial'),('module_bundle_items','commercial'),
    ('partner_module_prices','commercial'),('tenant_savings_contracts','commercial'),
    ('tenant_savings_baselines','commercial'),('tenant_savings_settlements','commercial'),
    ('gateway_devices','technical'),('gateway_update_jobs','technical'),
    ('gateway_release_channels','technical'),('gateway_device_inventory','technical'),
    ('gateway_ws_session_log','technical'),('gateway_commands','technical'),
    ('loxone_template_registry','technical'),('loxone_snippet_manuals','technical'),
    ('loxone_snippet_manual_images','technical'),('loxone_ws_session_log','technical'),
    ('wallbox_modbus_templates','technical'),('charger_models','technical'),
    ('cp_firmware_artifacts','technical'),('cp_firmware_jobs','technical'),
    ('cp_firmware_status_events','technical'),('bridge_workers','technical'),
    ('bridge_event_log','technical'),('monitoring_alert_rules','technical'),
    ('monitoring_alert_events','technical'),('support_sessions','technical')
  ) AS t(tbl, area)
  LOOP
    IF to_regclass('public.' || rec.tbl) IS NULL THEN CONTINUE; END IF;
    EXECUTE format('DROP POLICY IF EXISTS "portal_read" ON public.%I', rec.tbl);
    EXECUTE format('DROP POLICY IF EXISTS "portal_write" ON public.%I', rec.tbl);
    EXECUTE format('CREATE POLICY "portal_read" ON public.%I FOR SELECT TO authenticated USING (public.can_portal_read(auth.uid(), %L))', rec.tbl, rec.area);
    EXECUTE format('CREATE POLICY "portal_write" ON public.%I FOR ALL TO authenticated USING (public.can_portal_write(auth.uid(), %L)) WITH CHECK (public.can_portal_write(auth.uid(), %L))', rec.tbl, rec.area, rec.area);
  END LOOP;
END $$;