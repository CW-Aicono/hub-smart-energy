ALTER TABLE public.license_sales ADD COLUMN IF NOT EXISTS custom_lines jsonb;
ALTER TABLE public.license_sales DROP CONSTRAINT IF EXISTS license_sales_product_kind_check;
ALTER TABLE public.license_sales ADD CONSTRAINT license_sales_product_kind_check CHECK (product_kind IN ('module','package','unit','custom'));
GRANT SELECT ON public.license_sales TO authenticated;
GRANT ALL ON public.license_sales TO service_role;

CREATE OR REPLACE FUNCTION public.validate_custom_invoice_sale() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
DECLARE l jsonb; q numeric; p numeric;
BEGIN
 IF NEW.product_kind <> 'custom' THEN RETURN NEW; END IF;
 IF NEW.custom_lines IS NULL OR jsonb_typeof(NEW.custom_lines)<>'array' OR jsonb_array_length(NEW.custom_lines) NOT BETWEEN 1 AND 50 THEN RAISE EXCEPTION 'Mindestens eine eigene Position erforderlich (max. 50)'; END IF;
 IF NEW.quantity<>1 OR NEW.purchase_price<>0 OR NEW.product_code !~ '^custom_[a-f0-9]{32}$' THEN RAISE EXCEPTION 'Ungültige individuelle Abrechnung'; END IF;
 FOR l IN SELECT value FROM jsonb_array_elements(NEW.custom_lines) LOOP
  q:=(l->>'quantity')::numeric; p:=(l->>'unit_price')::numeric;
  IF length(trim(coalesce(l->>'label',''))) NOT BETWEEN 1 AND 200 OR q IS NULL OR q<>trunc(q) OR q NOT BETWEEN 1 AND 100000 OR p IS NULL OR p NOT BETWEEN 0 AND 1000000 OR p::text IN ('NaN','Infinity','-Infinity') THEN RAISE EXCEPTION 'Ungültiger Rechnungsposten'; END IF;
 END LOOP;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS validate_custom_invoice_sale ON public.license_sales;
CREATE TRIGGER validate_custom_invoice_sale BEFORE INSERT OR UPDATE ON public.license_sales FOR EACH ROW EXECUTE FUNCTION public.validate_custom_invoice_sale();
CREATE OR REPLACE FUNCTION public.check_license_sale_preflight() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$ BEGIN
 IF NEW.product_kind <> 'custom' THEN PERFORM preflight_license_sale(NEW.tenant_id,NEW.product_kind,NEW.product_code,NEW.quantity,NEW.cadence,NEW.sale_price,NEW.starts_on,NEW.payment_method,NEW.request_id); END IF;
 RETURN NEW;
END $$;

DO $$ BEGIN
 IF to_regprocedure('public.bill_catalog_license_sale(uuid,date,boolean)') IS NULL THEN ALTER FUNCTION public.bill_license_sale(uuid,date,boolean) RENAME TO bill_catalog_license_sale; END IF;
END $$;
REVOKE ALL ON FUNCTION public.bill_catalog_license_sale(uuid,date,boolean) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.bill_catalog_license_sale(uuid,date,boolean) TO service_role;
CREATE OR REPLACE FUNCTION public.bill_license_sale(p_sale uuid,p_start date,p_supplement boolean DEFAULT false) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE s license_sales; e date; l jsonb; li jsonb:='[]'::jsonb; a numeric:=0; v numeric; ref text; inserted integer;
BEGIN
 SELECT * INTO s FROM license_sales WHERE id=p_sale FOR UPDATE;
 IF NOT FOUND THEN RETURN; END IF;
 IF s.product_kind<>'custom' THEN PERFORM bill_catalog_license_sale(p_sale,p_start,p_supplement); RETURN; END IF;
 IF s.ended_on IS NOT NULL AND p_start>s.ended_on THEN RETURN; END IF;
 e:=license_period_end(p_start,s.cadence); IF s.ended_on IS NOT NULL THEN e:=least(e,s.ended_on); END IF;
 INSERT INTO license_billing_events(sale_id,period_start,period_end) VALUES(s.id,p_start,e) ON CONFLICT DO NOTHING;
 GET DIAGNOSTICS inserted=ROW_COUNT; IF inserted=0 THEN RETURN; END IF;
 FOR l IN SELECT value FROM jsonb_array_elements(s.custom_lines) LOOP
  v:=license_period_amount((l->>'unit_price')::numeric,(l->>'quantity')::integer,p_start,e,s.cadence);
  a:=a+v;
  li:=li||jsonb_build_array(jsonb_build_object('type','custom','sale_id',s.id,'label',l->>'label','quantity',(l->>'quantity')::integer,'unit_price',v/(l->>'quantity')::numeric,'amount',v));
 END LOOP;
 ref:='license:'||s.id||':'||p_start;
 IF s.partner_id IS NOT NULL THEN
  INSERT INTO partner_customer_invoices(partner_id,tenant_id,source_ref,period_start,period_end,amount,line_items,document_type,payment_method)
  VALUES(s.partner_id,s.tenant_id,ref,p_start,e,a,li,CASE WHEN a>0 THEN 'invoice' ELSE 'subscription_notice' END,s.payment_method) ON CONFLICT(source_ref) DO NOTHING;
 ELSE
  INSERT INTO tenant_invoices(tenant_id,source_ref,invoice_number,invoice_kind,status,document_type,period_start,period_end,amount,module_total,support_total,line_items)
  VALUES(s.tenant_id,ref,'DRAFT',CASE WHEN s.cadence='once' THEN 'one_time' ELSE 'recurring' END,'draft',CASE WHEN a>0 THEN 'invoice' ELSE 'subscription_notice' END,p_start,e,a,a,0,li) ON CONFLICT(source_ref) DO NOTHING;
 END IF;
 UPDATE license_sales SET next_period=CASE WHEN cadence='once' THEN NULL ELSE e+1 END WHERE id=s.id;
END $$;
REVOKE ALL ON FUNCTION public.bill_license_sale(uuid,date,boolean) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.bill_license_sale(uuid,date,boolean) TO service_role;

CREATE OR REPLACE FUNCTION public.create_custom_invoice_sale(p_tenant uuid,p_lines jsonb,p_cadence text,p_payment text,p_request uuid,p_start date) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE t tenants; old license_sales; l jsonb; li jsonb:='[]'::jsonb; total numeric:=0; v_id uuid; q numeric; p numeric;
BEGIN
 SELECT * INTO t FROM tenants WHERE id=p_tenant AND deleted_at IS NULL;
 IF NOT FOUND OR NOT (can_portal_write(auth.uid(),'commercial') OR can_manage_partner_billing(t.partner_id)) THEN RAISE EXCEPTION 'Keine Berechtigung'; END IF;
 IF t.partner_id IS NOT NULL AND EXISTS(SELECT 1 FROM partners WHERE id=t.partner_id AND (NOT is_active OR billing_mode='commission')) THEN RAISE EXCEPTION 'Partner nicht für Wiederverkauf freigeschaltet'; END IF;
 IF p_request IS NULL OR p_start IS DISTINCT FROM (now() AT TIME ZONE 'Europe/Berlin')::date OR p_cadence IS NULL OR p_cadence NOT IN ('once','monthly','quarterly','halfyearly') OR p_payment IS NULL OR p_payment NOT IN ('invoice','sepa') THEN RAISE EXCEPTION 'Ungültige Abrechnungsdaten'; END IF;
 IF p_lines IS NULL OR jsonb_typeof(p_lines)<>'array' OR jsonb_array_length(p_lines) NOT BETWEEN 1 AND 50 THEN RAISE EXCEPTION 'Mindestens eine eigene Position erforderlich (max. 50)'; END IF;
 FOR l IN SELECT value FROM jsonb_array_elements(p_lines) LOOP
  q:=(l->>'quantity')::numeric; p:=(l->>'unit_price')::numeric;
  IF length(trim(coalesce(l->>'label',''))) NOT BETWEEN 1 AND 200 OR q IS NULL OR q<>trunc(q) OR q NOT BETWEEN 1 AND 100000 OR p IS NULL OR p NOT BETWEEN 0 AND 1000000 OR p::text IN ('NaN','Infinity','-Infinity') THEN RAISE EXCEPTION 'Ungültiger Rechnungsposten'; END IF;
  li:=li||jsonb_build_array(jsonb_build_object('label',trim(l->>'label'),'quantity',q,'unit_price',round(p,2)));
  total:=total+round(q*round(p,2),2);
 END LOOP;
 PERFORM pg_advisory_xact_lock(hashtextextended(p_request::text,0));
 SELECT * INTO old FROM license_sales WHERE request_id=p_request;
 IF FOUND THEN
  IF old.tenant_id=p_tenant AND old.product_kind='custom' AND old.custom_lines=li AND old.cadence=p_cadence AND old.payment_method=p_payment AND old.starts_on=p_start THEN RETURN old.id; END IF;
  RAISE EXCEPTION 'Vorgangskennung bereits für andere Abrechnungsdaten verwendet';
 END IF;
 INSERT INTO license_sales(tenant_id,partner_id,product_kind,product_code,label,quantity,cadence,payment_method,sale_price,purchase_price,starts_on,request_id,created_by,custom_lines)
 VALUES(t.id,t.partner_id,'custom','custom_'||replace(p_request::text,'-',''),li->0->>'label',1,p_cadence,p_payment,total,0,p_start,p_request,auth.uid(),li) RETURNING id INTO v_id;
 PERFORM bill_license_sale(v_id,p_start,true);
 RETURN v_id;
END $$;
REVOKE ALL ON FUNCTION public.create_custom_invoice_sale(uuid,jsonb,text,text,uuid,date) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.create_custom_invoice_sale(uuid,jsonb,text,text,uuid,date) TO authenticated,service_role;