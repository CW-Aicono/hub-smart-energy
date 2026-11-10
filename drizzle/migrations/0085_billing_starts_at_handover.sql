-- Paketbuchung in der Einrichtungsphase: Module sofort frei, Abrechnung erst ab Übergabe.
CREATE OR REPLACE FUNCTION public.bill_license_sale(p_sale uuid, p_start date, p_supplement boolean DEFAULT false)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE s license_sales; e date; l jsonb; li jsonb:='[]'::jsonb; a numeric:=0; v numeric; ref text; inserted integer;
BEGIN
 SELECT * INTO s FROM license_sales WHERE id=p_sale FOR UPDATE;
 IF NOT FOUND THEN RETURN; END IF;
 -- Tenant noch in Einrichtung: keine Rechnung, Start wird bei Übergabe gesetzt
 IF EXISTS (SELECT 1 FROM tenants WHERE id=s.tenant_id AND setup_status='setup') THEN
  UPDATE license_sales SET next_period=NULL WHERE id=s.id; RETURN;
 END IF;
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
  VALUES(s.partner_id,s.tenant_id,ref,p_start,e,a,li,CASE WHEN a>0 THEN 'invoice' ELSE 'subscription_notice' END,s.payment_method) ON CONFLICT DO NOTHING;
 ELSE
  INSERT INTO tenant_invoices(tenant_id,source_ref,invoice_number,invoice_kind,status,document_type,period_start,period_end,amount,module_total,support_total,line_items)
  VALUES(s.tenant_id,ref,'DRAFT',CASE WHEN s.cadence='once' THEN 'one_time' ELSE 'recurring' END,'draft',CASE WHEN a>0 THEN 'invoice' ELSE 'subscription_notice' END,p_start,e,a,a,0,li) ON CONFLICT DO NOTHING;
 END IF;
 UPDATE license_sales SET next_period=CASE WHEN cadence='once' THEN NULL ELSE e+1 END WHERE id=s.id;
END $function$;

-- Einrichtungsgebühr erst bei Übergabe (setup -> active); Tenants ohne Einrichtungsphase wie bisher bei Anlage
CREATE OR REPLACE FUNCTION public.create_setup_invoice()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_uvp numeric; v_ek numeric; v_amount numeric; v_partner uuid;
BEGIN
  IF TG_OP='INSERT' AND coalesce(NEW.setup_status,'setup')='setup' THEN RETURN NEW; END IF;
  IF TG_OP='UPDATE' AND NOT (OLD.setup_status='setup' AND NEW.setup_status='active') THEN RETURN NEW; END IF;
  SELECT uvp, ek INTO v_uvp, v_ek FROM public.pricing_unit_prices WHERE code = 'setup';
  v_partner := NEW.partner_id;
  v_amount := CASE WHEN v_partner IS NULL THEN COALESCE(v_uvp,0) ELSE COALESCE(v_ek,0) END;
  IF v_amount <= 0 THEN RETURN NEW; END IF;
  INSERT INTO public.tenant_invoices (tenant_id, partner_id, invoice_kind, source_ref, invoice_number, document_type,
    period_start, period_end, amount, module_total, support_total, status, line_items)
  VALUES (NEW.id, v_partner, 'one_time', 'setup:' || NEW.id, 'DRAFT', 'invoice',
    CURRENT_DATE, CURRENT_DATE, v_amount, v_amount, 0, 'draft',
    jsonb_build_array(jsonb_build_object('type','one_time','label','Einrichtung ' || NEW.name, 'quantity',1, 'amount', v_amount)))
  ON CONFLICT DO NOTHING;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'create_setup_invoice: %', SQLERRM;
  RETURN NEW;
END $function$;
DROP TRIGGER IF EXISTS trg_create_setup_invoice ON public.tenants;
CREATE TRIGGER trg_create_setup_invoice AFTER INSERT ON public.tenants FOR EACH ROW EXECUTE FUNCTION public.create_setup_invoice();
DROP TRIGGER IF EXISTS trg_create_setup_invoice_handover ON public.tenants;
CREATE TRIGGER trg_create_setup_invoice_handover AFTER UPDATE OF setup_status ON public.tenants FOR EACH ROW EXECUTE FUNCTION public.create_setup_invoice();

-- Übergabe: Startdatum = Übergabedatum, Erstabrechnung auslösen
CREATE OR REPLACE FUNCTION public._finish_tenant_setup(_tenant_id uuid, _by uuid, _reason text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_count int; v_today date := (now() AT TIME ZONE 'Europe/Berlin')::date; s record;
BEGIN
  UPDATE public.tenants SET setup_status = 'active', setup_completed_at = now(), setup_completed_by = _by
   WHERE id = _tenant_id AND setup_status = 'setup';
  GET DIAGNOSTICS v_count = ROW_COUNT;
  IF v_count = 0 THEN RETURN false; END IF;
  UPDATE public.support_sessions SET ended_at = now()
   WHERE tenant_id = _tenant_id AND session_kind = 'setup' AND ended_at IS NULL;
  FOR s IN SELECT ls.id FROM public.license_sales ls
    WHERE ls.tenant_id = _tenant_id AND ls.ended_on IS NULL
      AND NOT EXISTS (SELECT 1 FROM public.license_billing_events e WHERE e.sale_id = ls.id)
    ORDER BY ls.created_at
  LOOP
    UPDATE public.license_sales SET starts_on = v_today, next_period = v_today WHERE id = s.id;
    PERFORM public.bill_license_sale(s.id, v_today, true);
  END LOOP;
  BEGIN
    INSERT INTO public.audit_logs(actor_user_id, tenant_id, action, entity_type, entity_id, metadata)
    VALUES (_by, _tenant_id, 'tenant_setup_completed', 'tenant', _tenant_id, jsonb_build_object('reason', _reason, 'billing_start', v_today));
  EXCEPTION WHEN others THEN NULL;
  END;
  RETURN true;
END $$;
REVOKE ALL ON FUNCTION public._finish_tenant_setup(uuid, uuid, text) FROM PUBLIC, anon, authenticated;