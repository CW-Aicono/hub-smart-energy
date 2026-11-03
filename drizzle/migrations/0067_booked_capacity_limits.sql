ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS charge_point_capacity_managed boolean NOT NULL DEFAULT false;
ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS location_capacity_managed boolean NOT NULL DEFAULT false;
CREATE OR REPLACE FUNCTION public.preflight_license_sale(p_tenant uuid, p_kind text, p_code text, p_quantity integer, p_cadence text, p_price numeric, p_start date, p_payment text, p_request uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $f$
DECLARE t tenants; old license_sales; d pricing_packages; mods text[]; m text;
BEGIN
SELECT * INTO t FROM tenants WHERE id=p_tenant AND deleted_at IS NULL;
IF NOT FOUND OR NOT (can_portal_write(auth.uid(),'commercial') OR can_manage_partner_billing(t.partner_id)) THEN RAISE EXCEPTION 'Keine Berechtigung'; END IF;
SELECT * INTO old FROM license_sales WHERE request_id=p_request;
IF FOUND THEN IF old.tenant_id=p_tenant AND old.product_kind=p_kind AND old.product_code=p_code AND old.quantity=p_quantity AND old.cadence=p_cadence AND old.sale_price=p_price AND old.starts_on=p_start AND old.payment_method=p_payment THEN RETURN old.id; ELSE RAISE EXCEPTION 'Vorgangskennung bereits für andere Verkaufsdaten verwendet'; END IF; END IF;
PERFORM validate_package_sale_input(p_kind,p_code,p_quantity,p_tenant);
IF p_kind NOT IN ('package','unit') OR p_cadence NOT IN ('once','monthly','quarterly','halfyearly') OR p_payment NOT IN ('invoice','sepa') OR p_quantity IS NULL OR p_quantity<1 OR p_quantity>100000 OR p_price IS NULL OR p_price<0 OR p_price>1000000 OR p_start IS NULL OR NOT isfinite(p_start) THEN RAISE EXCEPTION 'Ungültige Verkaufsdaten'; END IF;
IF t.partner_id IS NOT NULL AND EXISTS(SELECT 1 FROM partners WHERE id=t.partner_id AND (NOT is_active OR billing_mode='commission')) THEN RAISE EXCEPTION 'Partner nicht für Wiederverkauf freigeschaltet'; END IF;
IF (p_kind='package' OR p_code='remote_support') AND EXISTS(SELECT 1 FROM license_sales WHERE tenant_id=p_tenant AND product_kind=p_kind AND product_code=p_code AND ended_on IS NULL) THEN RAISE EXCEPTION 'Bereits als Vertrag erfasst'; END IF;
IF p_kind='package' THEN
SELECT * INTO d FROM pricing_packages WHERE code=p_code AND active AND NOT always_active; IF NOT FOUND THEN RAISE EXCEPTION 'Paket fehlt'; END IF;
IF EXISTS(SELECT 1 FROM tenant_package_bookings WHERE tenant_id=p_tenant AND package_code=p_code AND cancelled_at IS NULL) THEN RAISE EXCEPTION 'Bestehende Paketbuchung unverändert lassen'; END IF;
IF d.requires_package IS NOT NULL AND NOT EXISTS(SELECT 1 FROM license_sales WHERE tenant_id=p_tenant AND product_kind='package' AND product_code=d.requires_package AND ended_on IS NULL) AND NOT EXISTS(SELECT 1 FROM tenant_package_bookings WHERE tenant_id=p_tenant AND package_code=d.requires_package AND cancelled_at IS NULL) THEN RAISE EXCEPTION 'Benötigtes Paket fehlt'; END IF;
IF d.requires_any_other AND NOT EXISTS(SELECT 1 FROM license_sales WHERE tenant_id=p_tenant AND product_kind='package' AND ended_on IS NULL) AND NOT EXISTS(SELECT 1 FROM tenant_package_bookings WHERE tenant_id=p_tenant AND cancelled_at IS NULL) AND NOT EXISTS(SELECT 1 FROM charge_points WHERE tenant_id=p_tenant) AND NOT EXISTS(SELECT 1 FROM license_sales WHERE tenant_id=p_tenant AND product_kind='unit' AND product_code='charge_point' AND ended_on IS NULL) THEN RAISE EXCEPTION 'Weiteres Paket oder Ladepunkte erforderlich'; END IF;
IF EXISTS(SELECT 1 FROM license_sales s JOIN pricing_package_modules pm ON pm.module_code=s.product_code WHERE s.tenant_id=p_tenant AND s.product_kind='module' AND s.ended_on IS NULL AND pm.package_code=p_code) THEN RAISE EXCEPTION 'Bereits einzeln verkaufte Module im Paket'; END IF;
SELECT array_agg(module_code) INTO mods FROM pricing_package_modules WHERE package_code=p_code;
ELSE
IF p_code NOT IN ('remote_support','setup','charge_point','extra_location') OR NOT EXISTS(SELECT 1 FROM pricing_unit_prices WHERE code=p_code) THEN RAISE EXCEPTION 'Diese Position wird automatisch gezählt'; END IF;
IF p_code IN ('charge_point','extra_location') AND p_cadence='once' THEN RAISE EXCEPTION 'Kapazität nur regelmäßig buchbar'; END IF;
IF p_code='setup' AND p_cadence<>'once' THEN RAISE EXCEPTION 'Einrichtung nur einmalig'; END IF;
IF t.partner_id IS NOT NULL AND EXISTS(SELECT 1 FROM pricing_unit_prices WHERE code=p_code AND NOT partner_available) THEN RAISE EXCEPTION 'Kein Partnerpreis für diese Zusatzleistung'; END IF;
mods:=CASE WHEN p_code='charge_point' THEN ARRAY['ev_charging','adhoc_payment'] WHEN p_code='extra_location' THEN ARRAY['locations'] ELSE ARRAY[]::text[] END;
END IF;
FOREACH m IN ARRAY coalesce(mods,ARRAY[]::text[]) LOOP IF t.partner_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM partner_modules WHERE partner_id=t.partner_id AND module_code=m) THEN RAISE EXCEPTION 'Nicht im Partnerportfolio: %',m; END IF; END LOOP;
RETURN NULL; END $f$;
CREATE OR REPLACE FUNCTION public.booked_tenant_capacity(p_tenant uuid,p_code text) RETURNS integer LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $f$
SELECT coalesce(sum(quantity),0)::integer FROM license_sales WHERE tenant_id=p_tenant AND product_kind='unit' AND product_code=p_code AND (ended_on IS NULL OR ended_on >= (now() AT TIME ZONE 'Europe/Berlin')::date)
$f$;
REVOKE ALL ON FUNCTION public.booked_tenant_capacity(uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.booked_tenant_capacity(uuid,text) TO service_role;
CREATE OR REPLACE FUNCTION public.activate_booked_capacity() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $f$
DECLARE used integer; capacity integer;
BEGIN
IF NEW.product_kind<>'unit' OR NEW.product_code NOT IN ('charge_point','extra_location') THEN RETURN NEW; END IF;
PERFORM 1 FROM tenants WHERE id=NEW.tenant_id FOR UPDATE;
capacity:=booked_tenant_capacity(NEW.tenant_id,NEW.product_code);
IF NEW.product_code='charge_point' THEN
SELECT count(*) INTO used FROM charge_points WHERE tenant_id=NEW.tenant_id;
IF used>capacity THEN RAISE EXCEPTION 'Mindestens % Ladepunkte für den vorhandenen Bestand buchen',used; END IF;
UPDATE tenants SET charge_point_capacity_managed=true WHERE id=NEW.tenant_id;
ELSE
SELECT count(*) INTO used FROM locations WHERE tenant_id=NEW.tenant_id AND NOT coalesce(is_archived,false);
IF used>capacity+1 THEN RAISE EXCEPTION 'Mindestens % weitere Liegenschaften für den vorhandenen Bestand buchen',used-1; END IF;
UPDATE tenants SET location_capacity_managed=true WHERE id=NEW.tenant_id;
END IF;
RETURN NEW; END $f$;
CREATE OR REPLACE TRIGGER activate_booked_capacity AFTER INSERT ON public.license_sales FOR EACH ROW EXECUTE FUNCTION public.activate_booked_capacity();
CREATE OR REPLACE FUNCTION public.enforce_booked_capacity() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $f$
DECLARE t tenants; capacity integer; used integer;
BEGIN
IF TG_TABLE_NAME='locations' THEN
IF coalesce(NEW.is_archived,false) THEN RETURN NEW; END IF;
IF TG_OP='UPDATE' THEN IF NEW.tenant_id IS NOT DISTINCT FROM OLD.tenant_id AND NOT coalesce(OLD.is_archived,false) THEN RETURN NEW; END IF; END IF;
ELSE
IF TG_OP='UPDATE' THEN IF NEW.tenant_id IS NOT DISTINCT FROM OLD.tenant_id THEN RETURN NEW; END IF; END IF;
END IF;
SELECT * INTO t FROM tenants WHERE id=NEW.tenant_id FOR UPDATE;
IF TG_TABLE_NAME='charge_points' THEN
IF NOT t.charge_point_capacity_managed THEN RETURN NEW; END IF;
capacity:=booked_tenant_capacity(NEW.tenant_id,'charge_point');
SELECT count(*) INTO used FROM charge_points WHERE tenant_id=NEW.tenant_id AND id<>NEW.id;
IF used>=capacity THEN RAISE EXCEPTION 'Gebuchte Ladepunkte ausgeschöpft (%). Weitere Ladepunkte buchen.',capacity; END IF;
ELSE
IF NOT t.location_capacity_managed THEN RETURN NEW; END IF;
IF EXISTS(SELECT 1 FROM license_sales WHERE tenant_id=NEW.tenant_id AND product_kind='package' AND product_code='p6_enterprise' AND (ended_on IS NULL OR ended_on >= (now() AT TIME ZONE 'Europe/Berlin')::date)) OR EXISTS(SELECT 1 FROM tenant_package_bookings WHERE tenant_id=NEW.tenant_id AND package_code='p6_enterprise' AND cancelled_at IS NULL) THEN RETURN NEW; END IF;
capacity:=1+booked_tenant_capacity(NEW.tenant_id,'extra_location');
SELECT count(*) INTO used FROM locations WHERE tenant_id=NEW.tenant_id AND NOT coalesce(is_archived,false) AND id<>NEW.id;
IF used>=capacity THEN RAISE EXCEPTION 'Gebuchte Liegenschaften ausgeschöpft (% inklusive Basis). Weitere Liegenschaften buchen.',capacity; END IF;
END IF;
RETURN NEW; END $f$;
CREATE OR REPLACE TRIGGER enforce_charge_point_capacity BEFORE INSERT OR UPDATE OF tenant_id ON public.charge_points FOR EACH ROW EXECUTE FUNCTION public.enforce_booked_capacity();
CREATE OR REPLACE TRIGGER enforce_location_capacity BEFORE INSERT OR UPDATE OF tenant_id,is_archived ON public.locations FOR EACH ROW EXECUTE FUNCTION public.enforce_booked_capacity();
COMMENT ON COLUMN public.tenants.charge_point_capacity_managed IS 'Explicit unit booking activates hard capacity enforcement; false preserves legacy tenants.';
COMMENT ON COLUMN public.tenants.location_capacity_managed IS 'Explicit extra-location booking activates capacity enforcement with one included base site; Enterprise remains unlimited.';