CREATE OR REPLACE FUNCTION public.create_quoted_manual_invoice(p_tenant_id uuid, p_partner_id uuid, p_lines jsonb, p_options jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
 v_id uuid:=gen_random_uuid(); v_start date:=(p_options->>'from')::date; v_end date; v_term integer:=nullif(p_options->>'term_months','')::integer;
 v_cadence text:=p_options->>'cadence'; v_payment text:=p_options->>'payment'; v_from date; v_to date; v_after text:=p_options->>'after';
 v_line jsonb; v_lines jsonb:='[]'; v_qty integer; v_price numeric; v_sale numeric; v_discount numeric; v_mode text; v_amount numeric; v_total numeric:=0; v_monthly boolean; v_month date; v_half date; v_last date; v_rate numeric; v_months integer;
BEGIN
 IF NOT coalesce(public.can_portal_write(auth.uid(),'commercial'),false) THEN RAISE EXCEPTION 'Keine Berechtigung'; END IF;
 IF p_tenant_id IS NULL OR NOT EXISTS(SELECT 1 FROM public.tenants WHERE id=p_tenant_id AND deleted_at IS NULL) THEN RAISE EXCEPTION 'Tenant fehlt'; END IF;
 IF p_partner_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.tenants WHERE id=p_tenant_id AND partner_id=p_partner_id) THEN RAISE EXCEPTION 'Tenant gehört nicht zum Partner'; END IF;
 IF v_start IS NULL OR v_cadence IS NULL OR v_cadence NOT IN ('once','monthly','quarterly','halfyearly','yearly') OR v_payment IS NULL OR v_payment NOT IN ('invoice','sepa') THEN RAISE EXCEPTION 'Abrechnungsdaten ungültig'; END IF;
 IF v_term IS NOT NULL AND (v_term<1 OR v_term>240) THEN RAISE EXCEPTION 'Laufzeit: 1 bis 240 Monate'; END IF;
 IF jsonb_typeof(p_lines) IS DISTINCT FROM 'array' OR jsonb_array_length(p_lines) NOT BETWEEN 1 AND 50 THEN RAISE EXCEPTION 'Positionen fehlen'; END IF;
 IF v_cadence='once' THEN v_end:=CASE WHEN v_term IS NOT NULL THEN (v_start+make_interval(months=>v_term))::date-1 ELSE (p_options->>'to')::date END;
 ELSE v_months:=CASE v_cadence WHEN 'monthly' THEN 1 WHEN 'quarterly' THEN 3 WHEN 'halfyearly' THEN 6 ELSE 12 END;
 v_end:=(date_trunc('year',v_start)+make_interval(months=>((extract(month FROM v_start)::integer-1)/v_months+1)*v_months))::date-1;
 END IF;
 IF v_term IS NOT NULL THEN v_end:=least(v_end,(v_start+make_interval(months=>v_term))::date-1); END IF;
 IF coalesce((p_options->>'limited')::boolean,false) THEN
 v_from:=(p_options->>'discount_from')::date; v_to:=(p_options->>'discount_to')::date;
 IF v_from IS NULL OR v_to IS NULL OR v_from<v_start OR v_to<v_from OR extract(day FROM v_from) NOT IN (1,16) OR NOT (extract(day FROM v_to)=15 OR v_to=(date_trunc('month',v_to)+interval '1 month - 1 day')::date) OR v_after IS NULL OR v_after NOT IN ('continue','end') THEN RAISE EXCEPTION 'Rabattzeitraum ungültig'; END IF;
 IF v_after='end' THEN v_end:=least(v_end,v_to); END IF;
 END IF;
 IF v_end IS NULL OR v_end<v_start THEN RAISE EXCEPTION 'Leistungszeitraum ungültig'; END IF;
 FOR v_line IN SELECT * FROM jsonb_array_elements(p_lines) LOOP
 v_qty:=(v_line->>'quantity')::integer; v_price:=(v_line->>'unit_price')::numeric; v_monthly:=coalesce((v_line->>'monthly')::boolean,false);
 v_mode:=coalesce(v_line->>'discount_mode',p_options->>'discount_mode'); v_discount:=coalesce(v_line->>'discount_value',p_options->>'discount_value')::numeric;
 IF coalesce(trim(v_line->>'label'),'')='' OR length(v_line->>'label')>200 OR v_qty IS NULL OR v_qty NOT BETWEEN 1 AND 100000 OR v_price IS NULL OR v_price<0 OR v_price>1000000 OR v_price='NaN'::numeric OR v_discount IS NULL OR v_discount<0 OR v_discount='NaN'::numeric OR v_mode IS NULL OR v_mode NOT IN ('percent','absolute') OR (v_mode='percent' AND v_discount>100) OR (v_mode='absolute' AND v_discount>v_price) THEN RAISE EXCEPTION 'Position oder Rabatt ungültig'; END IF;
 IF v_cadence='once' AND v_monthly AND v_term IS NULL THEN RAISE EXCEPTION 'Einmalzahlung benötigt Laufzeit'; END IF;
 v_sale:=round(CASE v_mode WHEN 'percent' THEN v_price*(1-v_discount/100) ELSE v_price-v_discount END,2);
 v_amount:=0;
 IF NOT v_monthly THEN v_amount:=round((CASE WHEN v_from IS NULL OR v_start BETWEEN v_from AND v_to THEN v_sale ELSE v_price END)*v_qty,2);
 ELSE
 v_month:=date_trunc('month',v_start)::date;
 WHILE v_month<=v_end LOOP
 FOR i IN 0..1 LOOP
 v_half:=v_month+CASE WHEN i=0 THEN 0 ELSE 15 END; v_last:=CASE WHEN i=0 THEN v_month+14 ELSE (v_month+interval '1 month - 1 day')::date END;
 IF v_half<=v_end AND v_last>=v_start THEN
 v_rate:=CASE WHEN v_from IS NULL OR (v_half<=v_to AND v_last>=v_from) THEN v_sale ELSE v_price END; v_amount:=v_amount+v_rate*v_qty/2;
 END IF;
 END LOOP;
 v_month:=(v_month+interval '1 month')::date;
 END LOOP;
 v_amount:=round(v_amount,2);
 END IF;
 v_total:=v_total+v_amount;
 v_lines:=v_lines||jsonb_build_object('type','manual','label',left(v_line->>'label',160)||' · '||v_start::text||' – '||(CASE WHEN v_monthly THEN v_end ELSE v_start END)::text||CASE WHEN v_term IS NULL THEN '' ELSE ' · '||v_term||' M' END||CASE WHEN v_discount=0 THEN '' ELSE ' · Rabatt '||v_discount||CASE WHEN v_mode='percent' THEN ' %' ELSE ' EUR' END END||CASE WHEN v_from IS NULL THEN '' ELSE ' ('||v_from||' – '||v_to||')' END,'quantity',v_qty,'unit_price',v_amount/v_qty,'amount',v_amount,'list_unit_price',v_price,'monthly',v_monthly,'discount_mode',v_mode,'discount_value',v_discount,'billing_options',p_options,'period_start',v_start,'period_end',CASE WHEN v_monthly THEN v_end ELSE v_start END);
 END LOOP;
 INSERT INTO public.tenant_invoices(id,tenant_id,partner_id,invoice_kind,source_ref,invoice_number,document_type,status,period_start,period_end,amount,module_total,support_total,line_items)
 VALUES(v_id,p_tenant_id,p_partner_id,'one_time','manual:'||v_id,'DRAFT',CASE WHEN v_total=0 THEN 'subscription_notice' ELSE 'invoice' END,'draft',v_start,v_end,v_total,v_total,0,v_lines);
 RETURN v_id;
END $$;
REVOKE ALL ON FUNCTION public.create_quoted_manual_invoice(uuid,uuid,jsonb,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.create_quoted_manual_invoice(uuid,uuid,jsonb,jsonb) TO authenticated,service_role;
COMMENT ON FUNCTION public.create_quoted_manual_invoice(uuid,uuid,jsonb,jsonb) IS 'manual_invoice_options_v1440: single draft, server pricing, discounts, term, no entitlements';
NOTIFY pgrst,'reload schema';