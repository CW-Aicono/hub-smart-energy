CREATE OR REPLACE FUNCTION public.preflight_license_sale(p_tenant uuid,p_kind text,p_code text,p_quantity integer,p_cadence text,p_price numeric,p_start date,p_payment text,p_request uuid) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ DECLARE t tenants; old license_sales; d pricing_packages; mods text[]; m text; BEGIN
SELECT * INTO t FROM tenants WHERE id=p_tenant AND deleted_at IS NULL; IF NOT FOUND OR NOT (can_portal_write(auth.uid(),'commercial') OR can_manage_partner_billing(t.partner_id)) THEN RAISE EXCEPTION 'Keine Berechtigung'; END IF;
SELECT * INTO old FROM license_sales WHERE request_id=p_request; IF FOUND THEN IF old.tenant_id=p_tenant AND old.product_kind=p_kind AND old.product_code=p_code AND old.quantity=p_quantity AND old.cadence=p_cadence AND old.sale_price=p_price AND old.starts_on=p_start AND old.payment_method=p_payment THEN RETURN old.id; ELSE RAISE EXCEPTION 'Vorgangskennung bereits für andere Verkaufsdaten verwendet'; END IF; END IF;
PERFORM validate_package_sale_input(p_kind,p_code,p_quantity,p_tenant);
IF p_kind NOT IN ('package','unit') OR p_cadence NOT IN ('once','monthly','quarterly','halfyearly') OR p_payment NOT IN ('invoice','sepa') OR p_quantity IS NULL OR p_quantity<1 OR p_quantity>100000 OR p_price IS NULL OR p_price<0 OR p_price>1000000 OR p_start IS DISTINCT FROM (now() AT TIME ZONE 'Europe/Berlin')::date THEN RAISE EXCEPTION 'Ungültige Verkaufsdaten'; END IF;
IF t.partner_id IS NOT NULL AND EXISTS(SELECT 1 FROM partners WHERE id=t.partner_id AND (NOT is_active OR billing_mode='commission')) THEN RAISE EXCEPTION 'Partner nicht für Wiederverkauf freigeschaltet'; END IF;
IF (p_kind='package' OR p_code='remote_support') AND EXISTS(SELECT 1 FROM license_sales WHERE tenant_id=p_tenant AND product_kind=p_kind AND product_code=p_code AND ended_on IS NULL) THEN RAISE EXCEPTION 'Bereits als Vertrag erfasst'; END IF;
IF p_kind='package' THEN SELECT * INTO d FROM pricing_packages WHERE code=p_code AND active AND NOT always_active; IF NOT FOUND THEN RAISE EXCEPTION 'Paket fehlt'; END IF;
IF EXISTS(SELECT 1 FROM tenant_package_bookings WHERE tenant_id=p_tenant AND package_code=p_code AND cancelled_at IS NULL) THEN RAISE EXCEPTION 'Bestehende Paketbuchung unverändert lassen'; END IF;
IF d.requires_package IS NOT NULL AND NOT EXISTS(SELECT 1 FROM license_sales WHERE tenant_id=p_tenant AND product_kind='package' AND product_code=d.requires_package AND ended_on IS NULL) AND NOT EXISTS(SELECT 1 FROM tenant_package_bookings WHERE tenant_id=p_tenant AND package_code=d.requires_package AND cancelled_at IS NULL) THEN RAISE EXCEPTION 'Benötigtes Paket fehlt'; END IF;
IF d.requires_any_other AND NOT EXISTS(SELECT 1 FROM license_sales WHERE tenant_id=p_tenant AND product_kind='package' AND ended_on IS NULL) AND NOT EXISTS(SELECT 1 FROM tenant_package_bookings WHERE tenant_id=p_tenant AND cancelled_at IS NULL) THEN RAISE EXCEPTION 'Weiteres Paket fehlt'; END IF;
IF EXISTS(SELECT 1 FROM license_sales s JOIN pricing_package_modules pm ON pm.module_code=s.product_code WHERE s.tenant_id=p_tenant AND s.product_kind='module' AND s.ended_on IS NULL AND pm.package_code=p_code) THEN RAISE EXCEPTION 'Bereits einzeln verkaufte Module im Paket'; END IF;
SELECT array_agg(module_code) INTO mods FROM pricing_package_modules WHERE package_code=p_code;
ELSE IF p_code NOT IN ('charge_point','extra_location','remote_support') OR NOT EXISTS(SELECT 1 FROM pricing_unit_prices WHERE code=p_code) THEN RAISE EXCEPTION 'Zusatzleistung fehlt'; END IF;
IF t.partner_id IS NOT NULL AND EXISTS(SELECT 1 FROM pricing_unit_prices WHERE code=p_code AND NOT partner_available) THEN RAISE EXCEPTION 'Kein Partnerpreis für diese Zusatzleistung'; END IF;
mods:=CASE WHEN p_code='charge_point' THEN ARRAY['ev_charging','adhoc_payment'] WHEN p_code='extra_location' THEN ARRAY['locations'] ELSE ARRAY[]::text[] END; END IF;
FOREACH m IN ARRAY coalesce(mods,ARRAY[]::text[]) LOOP IF t.partner_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM partner_modules WHERE partner_id=t.partner_id AND module_code=m) THEN RAISE EXCEPTION 'Nicht im Partnerportfolio: %',m; END IF; END LOOP;
RETURN NULL; END $$;
REVOKE ALL ON FUNCTION public.preflight_license_sale(uuid,text,text,integer,text,numeric,date,text,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.preflight_license_sale(uuid,text,text,integer,text,numeric,date,text,uuid) TO authenticated;
CREATE OR REPLACE FUNCTION public.create_license_sale(p_tenant uuid,p_kind text,p_code text,p_quantity integer,p_cadence text,p_price numeric,p_start date,p_payment text,p_request uuid) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ DECLARE t tenants; v_price numeric; v_label text; v_id uuid; v_mods text[]; m text; BEGIN
IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Nicht angemeldet'; END IF;
SELECT * INTO t FROM tenants WHERE id=p_tenant AND deleted_at IS NULL FOR UPDATE; IF NOT FOUND THEN RAISE EXCEPTION 'Kunde fehlt'; END IF;
v_id:=preflight_license_sale(p_tenant,p_kind,p_code,p_quantity,p_cadence,p_price,p_start,p_payment,p_request); IF v_id IS NOT NULL THEN RETURN v_id; END IF;
IF p_kind='package' THEN
SELECT CASE WHEN t.partner_id IS NULL THEN uvp ELSE ek END,name INTO v_price,v_label FROM pricing_packages WHERE code=p_code AND active AND NOT always_active;
SELECT array_agg(module_code) INTO v_mods FROM pricing_package_modules WHERE package_code=p_code;
ELSE
SELECT CASE WHEN t.partner_id IS NULL THEN coalesce(new_sale_uvp,uvp) ELSE ek END,CASE WHEN code='charge_point' THEN 'Ladeinfrastruktur je Ladepunkt' WHEN code='remote_support' THEN 'Remote-Support-Flatrate' ELSE name END INTO v_price,v_label FROM pricing_unit_prices WHERE code=p_code;
v_mods:=CASE WHEN p_code='charge_point' THEN ARRAY['ev_charging','adhoc_payment'] WHEN p_code='extra_location' THEN ARRAY['locations'] ELSE ARRAY[]::text[] END;
END IF;
IF v_price IS NULL THEN RAISE EXCEPTION 'Katalogpreis fehlt'; END IF;
FOREACH m IN ARRAY coalesce(v_mods,ARRAY[]::text[]) LOOP
IF NOT EXISTS(SELECT 1 FROM tenant_modules WHERE tenant_id=p_tenant AND module_code=m AND is_enabled) THEN RAISE EXCEPTION 'Modul zuerst über Freigabeweg aktivieren: %',m; END IF;
IF t.partner_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM partner_modules WHERE partner_id=t.partner_id AND module_code=m) THEN RAISE EXCEPTION 'Nicht im Partnerportfolio'; END IF;
END LOOP;
INSERT INTO license_sales(tenant_id,partner_id,product_kind,product_code,label,quantity,cadence,payment_method,sale_price,purchase_price,starts_on,next_period,request_id,created_by) VALUES(p_tenant,t.partner_id,p_kind,p_code,v_label,p_quantity,p_cadence,p_payment,p_price,v_price,p_start,p_start,p_request,auth.uid()) RETURNING id INTO v_id;
PERFORM bill_license_sale(v_id,p_start,true); RETURN v_id; END $$;
REVOKE ALL ON FUNCTION public.create_license_sale(uuid,text,text,integer,text,numeric,date,text,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.create_license_sale(uuid,text,text,integer,text,numeric,date,text,uuid) TO service_role;