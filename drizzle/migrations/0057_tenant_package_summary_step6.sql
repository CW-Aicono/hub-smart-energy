-- Schritt 6: Kunden-Admins sehen gebuchte Pakete (ohne Preise), gesperrte Funktionen mit Paket-Hinweis
-- und die Absenderdaten für ihre ausgestellten AICONO-Rechnungen. Nur Mandanten-Admins.
CREATE OR REPLACE FUNCTION public.tenant_package_summary()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_tenant uuid := public.get_user_tenant_id(); v_partner text; v_pb boolean; v_res jsonb;
BEGIN
  IF v_tenant IS NULL OR NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Nur für Kunden-Admins' USING ERRCODE = '42501';
  END IF;
  SELECT p.name, t.package_billing INTO v_partner, v_pb
    FROM tenants t LEFT JOIN partners p ON p.id = t.partner_id WHERE t.id = v_tenant;
  WITH booked AS (
    SELECT package_code AS code, min(booked_at)::date AS since FROM tenant_package_bookings
     WHERE tenant_id = v_tenant AND cancelled_at IS NULL GROUP BY package_code
    UNION
    SELECT product_code, min(starts_on) FROM license_sales
     WHERE tenant_id = v_tenant AND product_kind = 'package' AND ended_on IS NULL AND starts_on <= current_date GROUP BY product_code
  ), b AS (SELECT code, min(since) AS since FROM booked GROUP BY code),
  enabled AS (SELECT module_code FROM tenant_modules WHERE tenant_id = v_tenant AND is_enabled)
  SELECT jsonb_build_object(
    'partner_name', v_partner,
    'package_billing', coalesce(v_pb, false),
    'packages', coalesce((SELECT jsonb_agg(jsonb_build_object('code', pp.code, 'name', pp.name, 'since', b.since,
        'modules', coalesce((SELECT jsonb_agg(m.module_code ORDER BY m.module_code) FROM pricing_package_modules m WHERE m.package_code = pp.code), '[]'::jsonb)) ORDER BY pp.sort)
      FROM pricing_packages pp LEFT JOIN b ON b.code = pp.code WHERE b.code IS NOT NULL OR pp.always_active), '[]'::jsonb),
    'locked', coalesce((SELECT jsonb_agg(jsonb_build_object('module_code', x.module_code, 'package_code', x.package_code, 'package_name', x.package_name) ORDER BY x.sort, x.module_code)
      FROM (SELECT DISTINCT ON (m.module_code) m.module_code, pp.code AS package_code, pp.name AS package_name, pp.sort
              FROM pricing_package_modules m JOIN pricing_packages pp ON pp.code = m.package_code
             WHERE pp.active AND NOT pp.always_active AND m.module_code NOT IN (SELECT module_code FROM enabled)
             ORDER BY m.module_code, pp.sort) x), '[]'::jsonb),
    'sender', (SELECT to_jsonb(s) - 'id' - 'updated_at' - 'number_prefix' FROM aicono_billing_settings s WHERE s.id = true)
  ) INTO v_res;
  RETURN v_res;
END $$;
REVOKE ALL ON FUNCTION public.tenant_package_summary() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.tenant_package_summary() TO authenticated;