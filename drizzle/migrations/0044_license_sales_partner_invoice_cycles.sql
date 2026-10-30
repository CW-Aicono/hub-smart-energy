CREATE TABLE IF NOT EXISTS public.license_sales (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES public.tenants(id), partner_id uuid REFERENCES public.partners(id), product_kind text NOT NULL, product_code text NOT NULL, label text NOT NULL, quantity integer NOT NULL DEFAULT 1, cadence text NOT NULL DEFAULT 'monthly', payment_method text NOT NULL DEFAULT 'invoice', sale_price numeric NOT NULL DEFAULT 0, purchase_price numeric NOT NULL DEFAULT 0, starts_on date NOT NULL DEFAULT current_date, next_period date, ended_on date, request_id uuid NOT NULL UNIQUE, created_by uuid, created_at timestamptz NOT NULL DEFAULT now(),
 CHECK(product_kind IN ('module','package','unit')), CHECK(cadence IN ('once','monthly','quarterly','halfyearly')), CHECK(payment_method IN ('invoice','sepa')), CHECK(quantity BETWEEN 1 AND 100000), CHECK(sale_price >= 0 AND purchase_price >= 0)
);
GRANT SELECT ON public.license_sales TO authenticated;
GRANT ALL ON public.license_sales TO service_role;
ALTER TABLE public.license_sales ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS license_sales_read ON public.license_sales;
CREATE POLICY license_sales_read ON public.license_sales FOR SELECT TO authenticated USING(public.can_portal_read(auth.uid(),'commercial') OR (partner_id IS NOT NULL AND public.is_partner_member(auth.uid(),partner_id)));
CREATE INDEX IF NOT EXISTS license_sales_due ON public.license_sales(next_period) WHERE ended_on IS NULL;
CREATE TABLE IF NOT EXISTS public.partner_billing_settings (
 partner_id uuid PRIMARY KEY REFERENCES public.partners(id), settings jsonb NOT NULL DEFAULT '{}'::jsonb, updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT,INSERT,UPDATE ON public.partner_billing_settings TO authenticated;
GRANT ALL ON public.partner_billing_settings TO service_role;
ALTER TABLE public.partner_billing_settings ENABLE ROW LEVEL SECURITY;
CREATE OR REPLACE FUNCTION public.can_manage_partner_billing(p_partner uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$ SELECT EXISTS(SELECT 1 FROM partner_members pm JOIN partners p ON p.id=pm.partner_id WHERE pm.user_id=auth.uid() AND pm.partner_id=p_partner AND pm.partner_role='partner_admin' AND p.is_active) $$;
REVOKE ALL ON FUNCTION public.can_manage_partner_billing(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.can_manage_partner_billing(uuid) TO authenticated,service_role;
DROP POLICY IF EXISTS partner_sender_read ON public.partner_billing_settings;
CREATE POLICY partner_sender_read ON public.partner_billing_settings FOR SELECT TO authenticated USING(public.is_partner_member(auth.uid(),partner_id));
DROP POLICY IF EXISTS partner_sender_write ON public.partner_billing_settings;
CREATE POLICY partner_sender_write ON public.partner_billing_settings FOR ALL TO authenticated USING(public.can_manage_partner_billing(partner_id)) WITH CHECK(public.can_manage_partner_billing(partner_id));
CREATE TABLE IF NOT EXISTS public.partner_customer_invoices (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), partner_id uuid NOT NULL REFERENCES public.partners(id), tenant_id uuid NOT NULL REFERENCES public.tenants(id), source_ref text NOT NULL UNIQUE, invoice_number text NOT NULL DEFAULT 'DRAFT', status text NOT NULL DEFAULT 'draft', document_type text NOT NULL DEFAULT 'invoice', amount numeric NOT NULL DEFAULT 0, line_items jsonb NOT NULL DEFAULT '[]'::jsonb, period_start date NOT NULL, period_end date NOT NULL, payment_method text NOT NULL DEFAULT 'invoice', issued_at timestamptz, issued_by uuid, due_date date, vat_rate numeric, sender_snapshot jsonb, recipient_snapshot jsonb, emailed_at timestamptz, emailed_to text, created_at timestamptz NOT NULL DEFAULT now(), CHECK(status IN ('draft','issued','sent','paid','voided')), CHECK(document_type IN ('invoice','subscription_notice'))
);
GRANT SELECT ON public.partner_customer_invoices TO authenticated;
GRANT ALL ON public.partner_customer_invoices TO service_role;
ALTER TABLE public.partner_customer_invoices ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS partner_invoice_read ON public.partner_customer_invoices;
CREATE POLICY partner_invoice_read ON public.partner_customer_invoices FOR SELECT TO authenticated USING(public.is_partner_member(auth.uid(),partner_id) OR (tenant_id=public.get_user_tenant_id() AND issued_at IS NOT NULL));
CREATE TABLE IF NOT EXISTS public.partner_invoice_counters (partner_id uuid NOT NULL REFERENCES public.partners(id), year integer NOT NULL, last_number integer NOT NULL DEFAULT 0, PRIMARY KEY(partner_id,year));
GRANT ALL ON public.partner_invoice_counters TO service_role;
ALTER TABLE public.partner_invoice_counters ENABLE ROW LEVEL SECURITY;
CREATE TABLE IF NOT EXISTS public.license_billing_events (sale_id uuid NOT NULL REFERENCES public.license_sales(id), period_start date NOT NULL, period_end date NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(sale_id,period_start));
GRANT ALL ON public.license_billing_events TO service_role;
ALTER TABLE public.license_billing_events ENABLE ROW LEVEL SECURITY;
CREATE OR REPLACE FUNCTION public.license_period_end(p_day date,p_cadence text) RETURNS date LANGUAGE plpgsql IMMUTABLE SET search_path=public AS $$ BEGIN RETURN CASE p_cadence WHEN 'once' THEN p_day WHEN 'monthly' THEN (date_trunc('month',p_day)+interval '1 month - 1 day')::date WHEN 'quarterly' THEN (date_trunc('quarter',p_day)+interval '3 months - 1 day')::date WHEN 'halfyearly' THEN (make_date(extract(year from p_day)::int,CASE WHEN extract(month from p_day)<=6 THEN 1 ELSE 7 END,1)+interval '6 months - 1 day')::date ELSE NULL END; END $$;
CREATE OR REPLACE FUNCTION public.license_period_amount(p_price numeric,p_quantity integer,p_start date,p_end date,p_cadence text) RETURNS numeric LANGUAGE plpgsql IMMUTABLE SET search_path=public AS $$ DECLARE m date; z date; v numeric:=0; BEGIN IF p_cadence='once' THEN RETURN round(p_price*p_quantity,2); END IF; m:=date_trunc('month',p_start)::date; WHILE m<=p_end LOOP z:=(m+interval '1 month - 1 day')::date; v:=v+p_price*p_quantity*(least(z,p_end)-greatest(m,p_start)+1)::numeric/(z-m+1); m:=(m+interval '1 month')::date; END LOOP; RETURN round(v,2); END $$;
CREATE OR REPLACE FUNCTION public.bill_license_sale(p_sale uuid,p_start date,p_supplement boolean DEFAULT false) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE s license_sales; e date; a numeric; b numeric; ref text; li jsonb; tn text; inv tenant_invoices; inserted integer;
BEGIN
 SELECT * INTO s FROM license_sales WHERE id=p_sale FOR UPDATE;
 IF NOT FOUND OR (s.ended_on IS NOT NULL AND p_start>s.ended_on) THEN RETURN; END IF;
 e:=license_period_end(p_start,s.cadence); IF s.ended_on IS NOT NULL THEN e:=least(e,s.ended_on); END IF;
 INSERT INTO license_billing_events(sale_id,period_start,period_end) VALUES(s.id,p_start,e) ON CONFLICT DO NOTHING; GET DIAGNOSTICS inserted=ROW_COUNT; IF inserted=0 THEN RETURN; END IF;
 SELECT name INTO tn FROM tenants WHERE id=s.tenant_id;
 a:=license_period_amount(s.sale_price,s.quantity,p_start,e,s.cadence); b:=license_period_amount(s.purchase_price,s.quantity,p_start,e,s.cadence);
 ref:='license:'||s.id||':'||p_start;
 li:=jsonb_build_array(jsonb_build_object('type','license','code',s.product_code,'sale_id',s.id,'label',s.label,'quantity',s.quantity,'unit_price',a/s.quantity,'amount',a));
 IF s.partner_id IS NOT NULL THEN
  INSERT INTO partner_customer_invoices(partner_id,tenant_id,source_ref,period_start,period_end,amount,line_items,document_type,payment_method) VALUES(s.partner_id,s.tenant_id,ref,p_start,e,a,li,CASE WHEN a>0 THEN 'invoice' ELSE 'subscription_notice' END,s.payment_method) ON CONFLICT(source_ref) DO NOTHING;
  a:=b;
 END IF;
 li:=jsonb_build_array(jsonb_build_object('type','license','code',s.product_code,'sale_id',s.id,'label',s.label||' – '||coalesce(tn,''),'quantity',s.quantity,'unit_price',a/s.quantity,'amount',a));
 IF s.partner_id IS NOT NULL AND NOT p_supplement THEN
  ref:='license-cycle:'||s.partner_id||':'||s.cadence||':'||p_start;
  PERFORM pg_advisory_xact_lock(hashtextextended(ref,0));
  SELECT * INTO inv FROM tenant_invoices WHERE source_ref=ref AND status<>'voided' FOR UPDATE;
  IF FOUND AND inv.issued_at IS NULL AND inv.lexware_invoice_id IS NULL AND inv.status='draft' THEN
   UPDATE tenant_invoices SET amount=amount+a,module_total=module_total+a,line_items=line_items||li,document_type=CASE WHEN amount+a>0 THEN 'invoice' ELSE 'subscription_notice' END WHERE id=inv.id;
  ELSE
   IF FOUND THEN ref:=ref||':'||s.id; END IF;
   INSERT INTO tenant_invoices(tenant_id,partner_id,source_ref,invoice_number,invoice_kind,status,document_type,period_start,period_end,amount,module_total,support_total,line_items) VALUES(s.tenant_id,s.partner_id,ref,'DRAFT','recurring','draft',CASE WHEN a>0 THEN 'invoice' ELSE 'subscription_notice' END,p_start,e,a,a,0,li);
  END IF;
 ELSE
  INSERT INTO tenant_invoices(tenant_id,partner_id,source_ref,invoice_number,invoice_kind,status,document_type,period_start,period_end,amount,module_total,support_total,line_items) VALUES(s.tenant_id,s.partner_id,ref,'DRAFT',CASE WHEN p_supplement OR s.cadence='once' THEN 'one_time' ELSE 'recurring' END,'draft',CASE WHEN a>0 THEN 'invoice' ELSE 'subscription_notice' END,p_start,e,a,a,0,li);
 END IF;
 UPDATE license_sales SET next_period=CASE WHEN cadence='once' THEN NULL ELSE e+1 END WHERE id=s.id;
END $$;
REVOKE ALL ON FUNCTION public.bill_license_sale(uuid,date,boolean) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.bill_license_sale(uuid,date,boolean) TO service_role;
CREATE OR REPLACE FUNCTION public.create_license_sale(p_tenant uuid,p_kind text,p_code text,p_quantity integer,p_cadence text,p_price numeric,p_start date,p_payment text,p_request uuid) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE t tenants; v_price numeric; v_label text; v_id uuid; v_mods text[]; m text;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Nicht angemeldet'; END IF;
 SELECT * INTO t FROM tenants WHERE id=p_tenant AND deleted_at IS NULL FOR UPDATE; IF NOT FOUND THEN RAISE EXCEPTION 'Kunde fehlt'; END IF;
 IF NOT (can_portal_write(auth.uid(),'commercial') OR (t.partner_id IS NOT NULL AND can_manage_partner_billing(t.partner_id))) THEN RAISE EXCEPTION 'Keine Berechtigung'; END IF;
 SELECT id INTO v_id FROM license_sales WHERE request_id=p_request; IF FOUND THEN RETURN v_id; END IF;
 IF p_kind NOT IN ('module','package','unit') OR p_cadence NOT IN ('once','monthly','quarterly','halfyearly') OR p_payment NOT IN ('invoice','sepa') OR p_quantity IS NULL OR p_quantity<1 OR p_quantity>100000 OR p_price IS NULL OR p_price<0 OR p_price>1000000 OR p_start IS NULL OR p_start>(now() AT TIME ZONE 'Europe/Berlin')::date OR p_start<(now() AT TIME ZONE 'Europe/Berlin')::date THEN RAISE EXCEPTION 'Ungültiger Verkaufsbeginn, Preis oder Intervall'; END IF;
 IF EXISTS(SELECT 1 FROM license_sales WHERE tenant_id=p_tenant AND product_kind=p_kind AND product_code=p_code AND ended_on IS NULL) AND p_kind<>'unit' THEN RAISE EXCEPTION 'Bereits als Vertrag erfasst'; END IF;
 IF p_kind='module' THEN
  IF EXISTS(SELECT 1 FROM tenant_package_bookings b JOIN pricing_package_modules pm ON pm.package_code=b.package_code WHERE b.tenant_id=p_tenant AND b.cancelled_at IS NULL AND pm.module_code=p_code) THEN RAISE EXCEPTION 'Modul bereits durch Paket abgedeckt'; END IF;
  SELECT CASE WHEN t.partner_id IS NULL THEN standard_price ELSE partner_price_monthly END,module_code INTO v_price,v_label FROM module_prices WHERE module_code=p_code;
  v_mods:=ARRAY[p_code];
 ELSIF p_kind='package' THEN
  IF EXISTS(SELECT 1 FROM tenant_package_bookings WHERE tenant_id=p_tenant AND package_code=p_code AND cancelled_at IS NULL) THEN RAISE EXCEPTION 'Bestehende Paketbuchung unverändert lassen'; END IF;
  SELECT CASE WHEN t.partner_id IS NULL THEN uvp ELSE ek END,name INTO v_price,v_label FROM pricing_packages WHERE code=p_code AND active AND NOT always_active;
  SELECT array_agg(module_code) INTO v_mods FROM pricing_package_modules WHERE package_code=p_code;
 ELSE
  IF p_code NOT IN ('charge_point','extra_location') THEN RAISE EXCEPTION 'Nicht als Lizenz verkaufbar'; END IF;
  SELECT CASE WHEN t.partner_id IS NULL THEN uvp ELSE ek END,name INTO v_price,v_label FROM pricing_unit_prices WHERE code=p_code;
  v_mods:=CASE WHEN p_code='charge_point' THEN ARRAY['ev_charging'] ELSE ARRAY['locations'] END;
 END IF;
 IF v_price IS NULL THEN RAISE EXCEPTION 'Katalogpreis fehlt'; END IF;
 FOREACH m IN ARRAY coalesce(v_mods,ARRAY[]::text[]) LOOP
  IF NOT EXISTS(SELECT 1 FROM tenant_modules WHERE tenant_id=p_tenant AND module_code=m AND is_enabled) THEN RAISE EXCEPTION 'Modul zuerst über Freigabeweg aktivieren: %',m; END IF;
  IF t.partner_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM partner_modules WHERE partner_id=t.partner_id AND module_code=m) THEN RAISE EXCEPTION 'Nicht im Partnerportfolio'; END IF;
 END LOOP;
 INSERT INTO license_sales(tenant_id,partner_id,product_kind,product_code,label,quantity,cadence,payment_method,sale_price,purchase_price,starts_on,next_period,request_id,created_by) VALUES(p_tenant,t.partner_id,p_kind,p_code,v_label,p_quantity,p_cadence,p_payment,p_price,v_price,p_start,p_start,p_request,auth.uid()) RETURNING id INTO v_id;
 PERFORM bill_license_sale(v_id,p_start,true); RETURN v_id;
END $$;
REVOKE ALL ON FUNCTION public.create_license_sale(uuid,text,text,integer,text,numeric,date,text,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.create_license_sale(uuid,text,text,integer,text,numeric,date,text,uuid) TO authenticated;
CREATE OR REPLACE FUNCTION public.generate_due_license_invoices() RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ DECLARE s license_sales; n integer:=0; today date:=(now() AT TIME ZONE 'Europe/Berlin')::date; BEGIN FOR s IN SELECT * FROM license_sales WHERE next_period<=today AND ended_on IS NULL FOR UPDATE SKIP LOCKED LOOP WHILE s.next_period<=today LOOP PERFORM bill_license_sale(s.id,s.next_period,false); n:=n+1; SELECT * INTO s FROM license_sales WHERE id=s.id; EXIT WHEN s.next_period IS NULL; END LOOP; END LOOP; RETURN n; END $$;
REVOKE ALL ON FUNCTION public.generate_due_license_invoices() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.generate_due_license_invoices() TO service_role;
CREATE OR REPLACE FUNCTION public.end_license_sale(p_sale uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ DECLARE s license_sales; BEGIN SELECT * INTO s FROM license_sales WHERE id=p_sale FOR UPDATE; IF NOT FOUND OR NOT (can_portal_write(auth.uid(),'commercial') OR can_manage_partner_billing(s.partner_id)) THEN RAISE EXCEPTION 'Keine Berechtigung'; END IF; UPDATE license_sales SET ended_on=license_period_end((now() AT TIME ZONE 'Europe/Berlin')::date,cadence),next_period=NULL WHERE id=p_sale; END $$;
REVOKE ALL ON FUNCTION public.end_license_sale(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.end_license_sale(uuid) TO authenticated;
CREATE OR REPLACE FUNCTION public.issue_partner_customer_invoice(p_invoice uuid) RETURNS public.partner_customer_invoices LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE i partner_customer_invoices; s jsonb; r jsonb; y integer:=extract(year from now() AT TIME ZONE 'Europe/Berlin')::int; n integer;
BEGIN SELECT * INTO i FROM partner_customer_invoices WHERE id=p_invoice FOR UPDATE; IF NOT FOUND OR NOT can_manage_partner_billing(i.partner_id) THEN RAISE EXCEPTION 'Keine Berechtigung'; END IF; IF i.issued_at IS NOT NULL THEN RETURN i; END IF;
 IF i.status='voided' OR i.amount<=0 OR i.document_type<>'invoice' THEN RAISE EXCEPTION 'Nur positive Rechnungen freigeben'; END IF;
 SELECT settings INTO s FROM partner_billing_settings WHERE partner_id=i.partner_id;
 IF coalesce(s->>'company_name','')='' OR coalesce(s->>'street','')='' OR coalesce(s->>'postal_code','')='' OR coalesce(s->>'city','')='' OR coalesce(s->>'iban','')='' OR (coalesce(s->>'vat_id','')='' AND coalesce(s->>'tax_number','')='') THEN RAISE EXCEPTION 'Rechnungsabsender vervollständigen'; END IF;
 IF coalesce((s->>'vat_rate')::numeric,19)<0 OR coalesce((s->>'vat_rate')::numeric,19)>100 OR coalesce((s->>'payment_terms_days')::integer,14)<0 OR coalesce((s->>'payment_terms_days')::integer,14)>365 THEN RAISE EXCEPTION 'Ungültige Steuer oder Zahlungsziel'; END IF;
 SELECT jsonb_build_object('name',name,'contact',contact_person,'street',concat_ws(' ',street,house_number),'postalCity',concat_ws(' ',postal_code,city),'email',contact_email,'sepa_iban',sepa_iban,'sepa_bic',sepa_bic,'sepa_account_holder',sepa_account_holder,'sepa_mandate_ref',sepa_mandate_ref,'sepa_mandate_date',sepa_mandate_date) INTO r FROM tenants WHERE id=i.tenant_id AND partner_id=i.partner_id;
 IF r IS NULL THEN RAISE EXCEPTION 'Kunde gehört nicht mehr zum Partner'; END IF;
 INSERT INTO partner_invoice_counters(partner_id,year,last_number) VALUES(i.partner_id,y,1) ON CONFLICT(partner_id,year) DO UPDATE SET last_number=partner_invoice_counters.last_number+1 RETURNING last_number INTO n;
 UPDATE partner_customer_invoices SET invoice_number=left(coalesce(nullif(s->>'number_prefix',''),'RE'),20)||'-'||y||'-'||lpad(n::text,5,'0'),issued_at=now(),issued_by=auth.uid(),due_date=(now() AT TIME ZONE 'Europe/Berlin')::date+coalesce((s->>'payment_terms_days')::int,14),vat_rate=coalesce((s->>'vat_rate')::numeric,19),sender_snapshot=s,recipient_snapshot=r,status='issued' WHERE id=p_invoice RETURNING * INTO i; RETURN i;
END $$;
REVOKE ALL ON FUNCTION public.issue_partner_customer_invoice(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.issue_partner_customer_invoice(uuid) TO authenticated;
CREATE OR REPLACE FUNCTION public.lock_partner_customer_invoice() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$ BEGIN IF TG_OP='DELETE' THEN IF OLD.issued_at IS NOT NULL THEN RAISE EXCEPTION 'Festgeschriebene Rechnung nicht löschen'; END IF; RETURN OLD; END IF; IF OLD.issued_at IS NOT NULL AND (to_jsonb(NEW)-ARRAY['status','emailed_at','emailed_to']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['status','emailed_at','emailed_to']) THEN RAISE EXCEPTION 'Festgeschriebene Rechnung unveränderlich'; END IF; RETURN NEW; END $$;
DROP TRIGGER IF EXISTS lock_partner_invoice ON public.partner_customer_invoices;
CREATE TRIGGER lock_partner_invoice BEFORE UPDATE OR DELETE ON public.partner_customer_invoices FOR EACH ROW EXECUTE FUNCTION public.lock_partner_customer_invoice();