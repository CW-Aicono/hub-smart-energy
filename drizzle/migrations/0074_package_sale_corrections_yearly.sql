ALTER TABLE public.license_sales ADD COLUMN IF NOT EXISTS discount_after text NOT NULL DEFAULT 'continue';
DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.license_sales'::regclass AND conname='license_sales_discount_after_check') THEN ALTER TABLE public.license_sales ADD CONSTRAINT license_sales_discount_after_check CHECK(discount_after IN ('continue','end') AND (discount_after='continue' OR discount_ends_on IS NOT NULL)); END IF; END $$;
ALTER TABLE public.license_sales DROP CONSTRAINT IF EXISTS license_sales_cadence_check;
ALTER TABLE public.license_sales ADD CONSTRAINT license_sales_cadence_check CHECK(cadence IN ('once','monthly','quarterly','halfyearly','yearly'));
CREATE OR REPLACE FUNCTION public.license_period_end(p_day date,p_cadence text) RETURNS date LANGUAGE plpgsql IMMUTABLE SET search_path=public AS $$ BEGIN RETURN CASE p_cadence WHEN 'once' THEN p_day WHEN 'monthly' THEN (date_trunc('month',p_day)+interval '1 month - 1 day')::date WHEN 'quarterly' THEN (date_trunc('quarter',p_day)+interval '3 months - 1 day')::date WHEN 'halfyearly' THEN (make_date(extract(year from p_day)::int,CASE WHEN extract(month from p_day)<=6 THEN 1 ELSE 7 END,1)+interval '6 months - 1 day')::date WHEN 'yearly' THEN make_date(extract(year from p_day)::int,12,31) ELSE NULL END; END $$;
DO $$ DECLARE d text; BEGIN SELECT pg_get_functiondef('public.preflight_license_sale(uuid,text,text,integer,text,numeric,date,text,uuid)'::regprocedure) INTO d; d:=replace(d,'''quarterly'',''halfyearly''','''quarterly'',''halfyearly'',''yearly'''); EXECUTE d; SELECT pg_get_functiondef('public.create_custom_invoice_sale(uuid,jsonb,text,text,uuid,date)'::regprocedure) INTO d; d:=replace(d,'''quarterly'',''halfyearly''','''quarterly'',''halfyearly'',''yearly'''); EXECUTE d; END $$;
CREATE OR REPLACE FUNCTION public.finalize_license_sale_options(p_tenant uuid,p_kind text,p_code text,p_quantity integer,p_cadence text,p_price numeric,p_start date,p_payment text,p_request uuid,p_discount numeric DEFAULT 0,p_discount_from date DEFAULT NULL,p_discount_to date DEFAULT NULL,p_reason text DEFAULT NULL,p_after text DEFAULT 'continue') RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE t tenants; v_id uuid; v_price numeric; v_list numeric; v_label text; v_mods text[]; m text; individual boolean;
BEGIN
PERFORM pg_advisory_xact_lock(hashtextextended(p_request::text,0)); v_id:=preflight_license_sale(p_tenant,p_kind,p_code,p_quantity,p_cadence,p_price,p_start,p_payment,p_request); IF v_id IS NOT NULL THEN RETURN v_id; END IF;
SELECT * INTO t FROM tenants WHERE id=p_tenant AND deleted_at IS NULL FOR UPDATE;
IF p_discount IS NULL OR p_discount<0 OR p_discount>100 THEN RAISE EXCEPTION 'Rabatt muss zwischen 0 und 100 Prozent liegen'; END IF;
IF p_kind='package' THEN SELECT CASE WHEN t.partner_id IS NULL THEN uvp ELSE ek END,uvp,name INTO v_price,v_list,v_label FROM pricing_packages WHERE code=p_code AND active AND NOT always_active; SELECT array_agg(module_code) INTO v_mods FROM pricing_package_modules WHERE package_code=p_code;
ELSE SELECT CASE WHEN t.partner_id IS NULL THEN coalesce(new_sale_uvp,uvp) ELSE ek END,coalesce(new_sale_uvp,uvp),CASE WHEN code='charge_point' THEN 'Ladeinfrastruktur je Ladepunkt' WHEN code='remote_support' THEN 'Remote-Support-Flatrate' WHEN code='setup' THEN 'Einrichtung (einmalig)' ELSE name END INTO v_price,v_list,v_label FROM pricing_unit_prices WHERE code=p_code; v_mods:=CASE WHEN p_code='charge_point' THEN ARRAY['ev_charging','adhoc_payment'] WHEN p_code='extra_location' THEN ARRAY['locations'] ELSE ARRAY[]::text[] END; END IF;
IF v_price IS NULL OR v_list IS NULL THEN RAISE EXCEPTION 'Katalogpreis fehlt'; END IF;
individual:=abs(round(v_list*(1-p_discount/100),2)-p_price)>0.004; IF individual AND length(trim(coalesce(p_reason,'')))<5 THEN RAISE EXCEPTION 'Abweichender Preis benötigt eine Begründung'; END IF;
FOREACH m IN ARRAY coalesce(v_mods,ARRAY[]::text[]) LOOP IF NOT EXISTS(SELECT 1 FROM tenant_modules WHERE tenant_id=p_tenant AND module_code=m AND is_enabled) THEN RAISE EXCEPTION 'Modul zuerst über Freigabeweg aktivieren: %',m; END IF; IF t.partner_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM partner_modules WHERE partner_id=t.partner_id AND module_code=m) THEN RAISE EXCEPTION 'Nicht im Partnerportfolio'; END IF; END LOOP;
INSERT INTO license_sales(tenant_id,partner_id,product_kind,product_code,label,quantity,cadence,payment_method,sale_price,purchase_price,starts_on,next_period,request_id,created_by,customer_discount_pct,list_sale_price,discount_starts_on,discount_ends_on,discount_after,ended_on,price_individual,price_reason) VALUES(p_tenant,t.partner_id,p_kind,p_code,v_label,p_quantity,p_cadence,p_payment,p_price,v_price,p_start,p_start,p_request,auth.uid(),p_discount,v_list,p_discount_from,p_discount_to,p_after,CASE WHEN p_after='end' THEN p_discount_to ELSE NULL END,individual,CASE WHEN individual THEN p_reason ELSE NULL END) RETURNING id INTO v_id;
PERFORM bill_license_sale(v_id,p_start,true); RETURN v_id; END $$;
REVOKE ALL ON FUNCTION public.finalize_license_sale_options(uuid,text,text,integer,text,numeric,date,text,uuid,numeric,date,date,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.finalize_license_sale_options(uuid,text,text,integer,text,numeric,date,text,uuid,numeric,date,date,text,text) TO authenticated;
CREATE OR REPLACE FUNCTION public.correct_license_sale(p_sale uuid,p_price numeric,p_quantity integer,p_cadence text,p_discount numeric,p_from date,p_to date,p_after text,p_reason text) RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE s license_sales; list numeric; inv record; lines jsonb; total numeric; first_start date; frozen boolean; used integer;
BEGIN
SELECT * INTO s FROM license_sales WHERE id=p_sale FOR UPDATE;
IF NOT FOUND OR NOT (can_portal_write(auth.uid(),'commercial') OR can_manage_partner_billing(s.partner_id)) THEN RAISE EXCEPTION 'Keine Berechtigung'; END IF;
IF s.product_kind NOT IN ('package','unit') OR s.ended_on < (now() AT TIME ZONE 'Europe/Berlin')::date THEN RAISE EXCEPTION 'Beendete Buchung bitte neu buchen'; END IF;
IF p_price IS NULL OR p_price NOT BETWEEN 0 AND 1000000 OR p_price::text IN ('NaN','Infinity','-Infinity') OR p_quantity IS NULL OR p_quantity NOT BETWEEN 1 AND 100000 OR p_cadence IS NULL OR p_cadence NOT IN ('once','monthly','quarterly','halfyearly','yearly') OR p_discount IS NULL OR p_discount NOT BETWEEN 0 AND 100 OR p_after IS NULL OR p_after NOT IN ('continue','end') OR length(trim(coalesce(p_reason,'')))<5 THEN RAISE EXCEPTION 'Ungültige Korrektur oder Begründung fehlt'; END IF;
IF s.product_kind='package' AND p_quantity<>1 OR s.product_code IN ('setup','remote_support') AND p_quantity<>1 OR s.product_code IN ('charge_point','extra_location') AND p_cadence='once' OR s.product_code='setup' AND p_cadence<>'once' THEN RAISE EXCEPTION 'Ungültige Menge oder Abrechnung'; END IF;
IF s.product_kind='package' THEN SELECT uvp INTO list FROM pricing_packages WHERE code=s.product_code; ELSE SELECT coalesce(new_sale_uvp,uvp) INTO list FROM pricing_unit_prices WHERE code=s.product_code; END IF;
list:=coalesce(s.list_sale_price,list,s.sale_price);
IF s.product_code='charge_point' THEN SELECT count(*) INTO used FROM charge_points WHERE tenant_id=s.tenant_id; IF booked_tenant_capacity(s.tenant_id,s.product_code)-s.quantity+p_quantity<used THEN RAISE EXCEPTION 'Vorhandene Ladepunkte müssen abgedeckt bleiben'; END IF; END IF;
IF s.product_code='extra_location' THEN SELECT count(*) INTO used FROM locations WHERE tenant_id=s.tenant_id AND NOT coalesce(is_archived,false); IF booked_tenant_capacity(s.tenant_id,s.product_code)-s.quantity+p_quantity+1<used THEN RAISE EXCEPTION 'Vorhandene Liegenschaften müssen abgedeckt bleiben'; END IF; END IF;
-- Lock all affected documents before deciding whether historical draft correction is safe.
PERFORM id FROM partner_customer_invoices WHERE tenant_id=s.tenant_id AND line_items @> jsonb_build_array(jsonb_build_object('sale_id',s.id)) FOR UPDATE;
PERFORM id FROM tenant_invoices WHERE tenant_id=s.tenant_id AND line_items @> jsonb_build_array(jsonb_build_object('sale_id',s.id)) FOR UPDATE;
SELECT EXISTS(SELECT 1 FROM partner_customer_invoices WHERE tenant_id=s.tenant_id AND line_items @> jsonb_build_array(jsonb_build_object('sale_id',s.id)) AND (status<>'draft' OR issued_at IS NOT NULL)) OR EXISTS(SELECT 1 FROM tenant_invoices WHERE tenant_id=s.tenant_id AND line_items @> jsonb_build_array(jsonb_build_object('sale_id',s.id)) AND (status<>'draft' OR issued_at IS NOT NULL OR lexware_invoice_id IS NOT NULL)) INTO frozen;
IF frozen AND (s.next_period IS NULL OR p_quantity<>s.quantity OR p_cadence<>s.cadence OR p_from IS NOT NULL AND p_from<s.next_period OR p_after='end' AND p_to<s.next_period) THEN RAISE EXCEPTION 'Ausgestellte Rechnung unveränderlich: Menge/Intervall nur nach Storno korrigieren; Rabatt ab nächster Abrechnung'; END IF;
IF NOT frozen THEN
 SELECT min(period_start) INTO first_start FROM license_billing_events WHERE sale_id=s.id;
 FOR inv IN SELECT id,line_items FROM partner_customer_invoices WHERE tenant_id=s.tenant_id AND line_items @> jsonb_build_array(jsonb_build_object('sale_id',s.id)) LOOP
 SELECT coalesce(jsonb_agg(value),'[]'::jsonb),coalesce(sum((value->>'amount')::numeric),0) INTO lines,total FROM jsonb_array_elements(inv.line_items) WHERE value->>'sale_id' IS DISTINCT FROM s.id::text;
 UPDATE partner_customer_invoices SET line_items=lines,amount=total,document_type=CASE WHEN total>0 THEN 'invoice' ELSE 'subscription_notice' END WHERE id=inv.id;
 END LOOP;
 FOR inv IN SELECT id,line_items FROM tenant_invoices WHERE tenant_id=s.tenant_id AND line_items @> jsonb_build_array(jsonb_build_object('sale_id',s.id)) LOOP
 SELECT coalesce(jsonb_agg(value),'[]'::jsonb),coalesce(sum((value->>'amount')::numeric),0) INTO lines,total FROM jsonb_array_elements(inv.line_items) WHERE value->>'sale_id' IS DISTINCT FROM s.id::text;
 UPDATE tenant_invoices SET line_items=lines,amount=total,module_total=total,document_type=CASE WHEN total>0 THEN 'invoice' ELSE 'subscription_notice' END WHERE id=inv.id;
 END LOOP;
 DELETE FROM license_billing_events WHERE sale_id=s.id;
END IF;
UPDATE license_sales SET sale_price=p_price,quantity=p_quantity,cadence=p_cadence,customer_discount_pct=p_discount,list_sale_price=list,discount_starts_on=p_from,discount_ends_on=p_to,discount_after=p_after,price_reason=trim(p_reason),price_individual=true,ended_on=CASE WHEN p_after='end' THEN p_to ELSE CASE WHEN discount_after='end' THEN NULL ELSE ended_on END END WHERE id=s.id;
IF NOT frozen THEN PERFORM bill_license_sale(s.id,coalesce(first_start,s.starts_on),true); END IF;
RETURN CASE WHEN frozen THEN 'future' ELSE 'draft' END;
END $$;
REVOKE ALL ON FUNCTION public.correct_license_sale(uuid,numeric,integer,text,numeric,date,date,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.correct_license_sale(uuid,numeric,integer,text,numeric,date,date,text,text) TO authenticated;
NOTIFY pgrst,'reload schema';