-- Schritt 4: Rechnungsflüsse nach Partnermodell, Gutschrift, Storno-Rechnung, E-Rechnungsangaben
ALTER TABLE public.tenant_invoices DROP CONSTRAINT IF EXISTS tenant_invoices_document_type_check;
ALTER TABLE public.tenant_invoices ADD CONSTRAINT tenant_invoices_document_type_check CHECK (document_type IN ('invoice','subscription_notice','credit_note','cancellation'));
ALTER TABLE public.partner_customer_invoices DROP CONSTRAINT IF EXISTS partner_customer_invoices_document_type_check;
ALTER TABLE public.partner_customer_invoices ADD CONSTRAINT partner_customer_invoices_document_type_check CHECK (document_type IN ('invoice','subscription_notice','cancellation'));

ALTER TABLE public.tenant_invoices ADD COLUMN IF NOT EXISTS cancels_invoice_id uuid REFERENCES public.tenant_invoices(id);
ALTER TABLE public.partner_customer_invoices ADD COLUMN IF NOT EXISTS cancels_invoice_id uuid REFERENCES public.partner_customer_invoices(id);
ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS partner_self_customer boolean NOT NULL DEFAULT false;
ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS leitweg_id text;
COMMENT ON COLUMN public.tenants.partner_self_customer IS 'Mandant ist der Partner selbst (Eigenbedarf): Rechnung "An Partner", kein Endkundenentwurf';
COMMENT ON COLUMN public.tenants.leitweg_id IS 'Leitweg-ID / Käuferreferenz für E-Rechnungen an öffentliche Auftraggeber';

CREATE OR REPLACE FUNCTION public.guard_tenant_invoice_options() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF NEW.partner_self_customer IS DISTINCT FROM OLD.partner_self_customer AND auth.uid() IS NOT NULL AND NOT can_portal_write(auth.uid(),'commercial') THEN
    RAISE EXCEPTION 'Nur AICONO-Admins dürfen den Eigenbedarf des Partners festlegen';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_guard_tenant_invoice_options ON public.tenants;
CREATE TRIGGER trg_guard_tenant_invoice_options BEFORE UPDATE ON public.tenants FOR EACH ROW EXECUTE FUNCTION public.guard_tenant_invoice_options();

CREATE OR REPLACE FUNCTION public.set_tenant_invoice_options(p_tenant uuid, p_self boolean, p_leitweg text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF NOT can_portal_write(auth.uid(),'commercial') THEN RAISE EXCEPTION 'Keine Berechtigung'; END IF;
  IF p_leitweg IS NOT NULL AND length(p_leitweg) > 60 THEN RAISE EXCEPTION 'Leitweg-ID zu lang'; END IF;
  UPDATE tenants SET partner_self_customer = coalesce(p_self,false), leitweg_id = nullif(trim(p_leitweg),'') WHERE id = p_tenant;
END $$;
REVOKE ALL ON FUNCTION public.set_tenant_invoice_options(uuid, boolean, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.set_tenant_invoice_options(uuid, boolean, text) TO authenticated;

-- Festschreiben: Rechnungen und Gutschriften
CREATE OR REPLACE FUNCTION public.issue_aicono_invoice(p_invoice_id uuid) RETURNS tenant_invoices LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_inv public.tenant_invoices; v_set public.aicono_billing_settings;
  v_year integer := extract(year from now() AT TIME ZONE 'Europe/Berlin')::int; v_no integer;
BEGIN
  IF NOT public.can_portal_write(auth.uid(), 'commercial') THEN RAISE EXCEPTION 'Keine Berechtigung'; END IF;
  SELECT * INTO v_inv FROM public.tenant_invoices WHERE id = p_invoice_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Rechnung nicht gefunden'; END IF;
  IF v_inv.issued_at IS NOT NULL THEN RETURN v_inv; END IF;
  IF v_inv.status = 'voided' THEN RAISE EXCEPTION 'Stornierte Rechnungen können nicht festgeschrieben werden'; END IF;
  IF v_inv.document_type NOT IN ('invoice','credit_note') OR coalesce(v_inv.amount,0) <= 0 THEN
    RAISE EXCEPTION 'Nur Rechnungen oder Gutschriften mit Betrag größer 0 € können festgeschrieben werden';
  END IF;
  SELECT * INTO v_set FROM public.aicono_billing_settings WHERE id = true;
  INSERT INTO public.aicono_invoice_counter (year, last_number) VALUES (v_year, 1)
    ON CONFLICT (year) DO UPDATE SET last_number = public.aicono_invoice_counter.last_number + 1 RETURNING last_number INTO v_no;
  UPDATE public.tenant_invoices SET
    invoice_number = coalesce(v_set.number_prefix, 'AIC') || '-' || v_year || '-' || lpad(v_no::text, 5, '0'),
    issued_at = now(), issued_by = auth.uid(),
    due_date = (now() AT TIME ZONE 'Europe/Berlin')::date + coalesce(v_set.payment_terms_days, 14),
    vat_rate = coalesce(v_set.vat_rate, 19),
    status = CASE WHEN status = 'draft' THEN 'sent' ELSE status END, updated_at = now()
  WHERE id = p_invoice_id RETURNING * INTO v_inv;
  RETURN v_inv;
END $$;

-- Storno-Rechnung AICONO: negierte Kopie mit Bezug auf das Original, Original wird storniert
CREATE OR REPLACE FUNCTION public.cancel_aicono_invoice(p_invoice_id uuid) RETURNS tenant_invoices LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE o public.tenant_invoices; c public.tenant_invoices; v_set public.aicono_billing_settings;
  v_year integer := extract(year from now() AT TIME ZONE 'Europe/Berlin')::int; v_no integer; v_lines jsonb;
BEGIN
  IF NOT public.can_portal_write(auth.uid(), 'commercial') THEN RAISE EXCEPTION 'Keine Berechtigung'; END IF;
  SELECT * INTO o FROM public.tenant_invoices WHERE id = p_invoice_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Rechnung nicht gefunden'; END IF;
  IF o.issued_at IS NULL THEN RAISE EXCEPTION 'Entwürfe werden nicht storniert, sondern gelöscht'; END IF;
  IF o.status = 'voided' OR o.document_type NOT IN ('invoice','credit_note') THEN RAISE EXCEPTION 'Rechnung ist bereits storniert oder nicht stornierbar'; END IF;
  SELECT coalesce(jsonb_agg(li || jsonb_build_object('amount', -coalesce((li->>'amount')::numeric,0))), '[]'::jsonb) INTO v_lines FROM jsonb_array_elements(coalesce(o.line_items,'[]'::jsonb)) li;
  SELECT * INTO v_set FROM public.aicono_billing_settings WHERE id = true;
  INSERT INTO public.aicono_invoice_counter (year, last_number) VALUES (v_year, 1)
    ON CONFLICT (year) DO UPDATE SET last_number = public.aicono_invoice_counter.last_number + 1 RETURNING last_number INTO v_no;
  INSERT INTO public.tenant_invoices (tenant_id, partner_id, invoice_kind, source_ref, invoice_number, document_type, status, period_start, period_end,
    amount, module_total, support_total, line_items, issued_at, issued_by, due_date, vat_rate, cancels_invoice_id)
  VALUES (o.tenant_id, o.partner_id, 'one_time', 'storno:' || o.id, coalesce(v_set.number_prefix,'AIC') || '-' || v_year || '-' || lpad(v_no::text,5,'0'),
    'cancellation', 'sent', o.period_start, o.period_end, -o.amount, -coalesce(o.module_total,0), -coalesce(o.support_total,0), v_lines,
    now(), auth.uid(), (now() AT TIME ZONE 'Europe/Berlin')::date, o.vat_rate, o.id)
  RETURNING * INTO c;
  UPDATE public.tenant_invoices SET status = 'voided', updated_at = now() WHERE id = o.id;
  RETURN c;
END $$;
REVOKE ALL ON FUNCTION public.cancel_aicono_invoice(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.cancel_aicono_invoice(uuid) TO authenticated;

-- Partner: Storno nur per Storno-Rechnung, freigegebene Rechnungen nicht direkt auf "storniert" setzen
CREATE OR REPLACE FUNCTION public.set_partner_invoice_status(p_invoice uuid, p_status text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE i partner_customer_invoices;
BEGIN
  SELECT * INTO i FROM partner_customer_invoices WHERE id=p_invoice FOR UPDATE;
  IF NOT FOUND OR NOT can_manage_partner_billing(i.partner_id) OR p_status NOT IN ('paid','voided') THEN RAISE EXCEPTION 'Keine Berechtigung'; END IF;
  IF p_status='paid' AND i.issued_at IS NULL THEN RAISE EXCEPTION 'Rechnung zuerst freigeben'; END IF;
  IF p_status='voided' AND i.issued_at IS NOT NULL THEN RAISE EXCEPTION 'Freigegebene Rechnungen nur per Storno-Rechnung korrigieren'; END IF;
  UPDATE partner_customer_invoices SET status=p_status WHERE id=p_invoice;
END $$;

CREATE OR REPLACE FUNCTION public.cancel_partner_customer_invoice(p_invoice uuid) RETURNS partner_customer_invoices LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE o partner_customer_invoices; c partner_customer_invoices; y integer:=extract(year from now() AT TIME ZONE 'Europe/Berlin')::int; n integer; v_lines jsonb;
BEGIN
  SELECT * INTO o FROM partner_customer_invoices WHERE id=p_invoice FOR UPDATE;
  IF NOT FOUND OR NOT can_manage_partner_billing(o.partner_id) THEN RAISE EXCEPTION 'Keine Berechtigung'; END IF;
  IF o.issued_at IS NULL THEN RAISE EXCEPTION 'Entwürfe werden nicht storniert'; END IF;
  IF o.status='voided' OR o.document_type<>'invoice' THEN RAISE EXCEPTION 'Rechnung ist bereits storniert oder nicht stornierbar'; END IF;
  SELECT coalesce(jsonb_agg(li || jsonb_build_object('amount', -coalesce((li->>'amount')::numeric,0))), '[]'::jsonb) INTO v_lines FROM jsonb_array_elements(coalesce(o.line_items,'[]'::jsonb)) li;
  INSERT INTO partner_invoice_counters(partner_id,year,last_number) VALUES(o.partner_id,y,1) ON CONFLICT(partner_id,year) DO UPDATE SET last_number=partner_invoice_counters.last_number+1 RETURNING last_number INTO n;
  INSERT INTO partner_customer_invoices(partner_id,tenant_id,source_ref,invoice_number,status,document_type,amount,line_items,period_start,period_end,payment_method,issued_at,issued_by,due_date,vat_rate,sender_snapshot,recipient_snapshot,cancels_invoice_id)
  VALUES(o.partner_id,o.tenant_id,'storno:'||o.id,left(coalesce(nullif(o.sender_snapshot->>'number_prefix',''),'RE'),20)||'-'||y||'-'||lpad(n::text,5,'0'),'issued','cancellation',-o.amount,v_lines,o.period_start,o.period_end,o.payment_method,now(),auth.uid(),(now() AT TIME ZONE 'Europe/Berlin')::date,o.vat_rate,o.sender_snapshot,o.recipient_snapshot,o.id)
  RETURNING * INTO c;
  UPDATE partner_customer_invoices SET status='voided' WHERE id=o.id;
  RETURN c;
END $$;
REVOKE ALL ON FUNCTION public.cancel_partner_customer_invoice(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.cancel_partner_customer_invoice(uuid) TO authenticated;

-- Partner ergänzt eigene Positionen auf Entwürfen (automatische Positionen bleiben erhalten)
CREATE OR REPLACE FUNCTION public.partner_set_custom_lines(p_invoice uuid, p_lines jsonb) RETURNS partner_customer_invoices LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE i partner_customer_invoices; v_custom jsonb; v_auto jsonb; v_all jsonb; v_sum numeric; li jsonb;
BEGIN
  SELECT * INTO i FROM partner_customer_invoices WHERE id=p_invoice FOR UPDATE;
  IF NOT FOUND OR NOT can_manage_partner_billing(i.partner_id) THEN RAISE EXCEPTION 'Keine Berechtigung'; END IF;
  IF i.issued_at IS NOT NULL OR i.status<>'draft' THEN RAISE EXCEPTION 'Nur Entwürfe können ergänzt werden'; END IF;
  IF jsonb_typeof(coalesce(p_lines,'[]'::jsonb))<>'array' OR jsonb_array_length(coalesce(p_lines,'[]'::jsonb))>50 THEN RAISE EXCEPTION 'Ungültige Positionen'; END IF;
  v_custom := '[]'::jsonb;
  FOR li IN SELECT * FROM jsonb_array_elements(coalesce(p_lines,'[]'::jsonb)) LOOP
    IF length(trim(coalesce(li->>'label','')))=0 OR length(li->>'label')>200 THEN RAISE EXCEPTION 'Bezeichnung fehlt'; END IF;
    IF (li->>'quantity')::numeric <= 0 OR (li->>'quantity')::numeric > 100000 OR abs((li->>'unit_price')::numeric) > 1000000 THEN RAISE EXCEPTION 'Ungültige Menge oder Preis'; END IF;
    v_custom := v_custom || jsonb_build_array(jsonb_build_object('type','custom','label',trim(li->>'label'),'quantity',(li->>'quantity')::numeric,
      'unit_price',(li->>'unit_price')::numeric,'amount',round((li->>'quantity')::numeric*(li->>'unit_price')::numeric,2)));
  END LOOP;
  SELECT coalesce(jsonb_agg(x),'[]'::jsonb) INTO v_auto FROM jsonb_array_elements(coalesce(i.line_items,'[]'::jsonb)) x WHERE coalesce(x->>'type','')<>'custom';
  v_all := v_auto || v_custom;
  SELECT coalesce(sum((x->>'amount')::numeric),0) INTO v_sum FROM jsonb_array_elements(v_all) x;
  UPDATE partner_customer_invoices SET line_items=v_all, amount=round(v_sum,2), document_type=CASE WHEN v_sum>0 THEN 'invoice' ELSE 'subscription_notice' END WHERE id=p_invoice RETURNING * INTO i;
  RETURN i;
END $$;
REVOKE ALL ON FUNCTION public.partner_set_custom_lines(uuid, jsonb) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.partner_set_custom_lines(uuid, jsonb) TO authenticated;