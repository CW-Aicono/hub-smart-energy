CREATE OR REPLACE FUNCTION public.cancel_mistaken_license_sale(p_sale uuid, p_reason text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $reversal$
DECLARE s license_sales; inv record; lines jsonb; total numeric;
BEGIN
  SELECT * INTO s FROM license_sales WHERE id=p_sale FOR UPDATE;
  IF NOT FOUND OR NOT (coalesce(can_portal_write(auth.uid(),'commercial'),false) OR coalesce(can_manage_partner_billing(s.partner_id),false)) THEN
    RAISE EXCEPTION 'Keine Berechtigung';
  END IF;
  IF length(trim(coalesce(p_reason,'')))<5 THEN RAISE EXCEPTION 'Begründung erforderlich'; END IF;
  PERFORM id FROM partner_customer_invoices WHERE tenant_id=s.tenant_id AND line_items @> jsonb_build_array(jsonb_build_object('sale_id',s.id)) FOR UPDATE;
  PERFORM id FROM tenant_invoices WHERE (tenant_id=s.tenant_id OR partner_id=s.partner_id) AND line_items @> jsonb_build_array(jsonb_build_object('sale_id',s.id)) FOR UPDATE;
  IF EXISTS(SELECT 1 FROM partner_customer_invoices WHERE tenant_id=s.tenant_id AND line_items @> jsonb_build_array(jsonb_build_object('sale_id',s.id)) AND status<>'voided' AND document_type<>'cancellation' AND (status<>'draft' OR issued_at IS NOT NULL))
    OR EXISTS(SELECT 1 FROM tenant_invoices WHERE (tenant_id=s.tenant_id OR partner_id=s.partner_id) AND line_items @> jsonb_build_array(jsonb_build_object('sale_id',s.id)) AND status<>'voided' AND document_type<>'cancellation' AND (status<>'draft' OR issued_at IS NOT NULL OR lexware_invoice_id IS NOT NULL)) THEN
    RAISE EXCEPTION 'Ausgestellte Rechnung zuerst stornieren';
  END IF;
  IF s.product_kind='unit' AND s.product_code='charge_point' AND booked_tenant_capacity(s.tenant_id,s.product_code)-s.quantity<(SELECT count(*) FROM charge_points WHERE tenant_id=s.tenant_id) THEN RAISE EXCEPTION 'Vorhandene Ladepunkte müssen abgedeckt bleiben'; END IF;
  IF s.product_kind='unit' AND s.product_code='extra_location' AND booked_tenant_capacity(s.tenant_id,s.product_code)-s.quantity+1<(SELECT count(*) FROM locations WHERE tenant_id=s.tenant_id AND NOT coalesce(is_archived,false)) THEN RAISE EXCEPTION 'Vorhandene Liegenschaften müssen abgedeckt bleiben'; END IF;
  FOR inv IN SELECT id,line_items FROM partner_customer_invoices WHERE status='draft' AND issued_at IS NULL AND tenant_id=s.tenant_id AND line_items @> jsonb_build_array(jsonb_build_object('sale_id',s.id)) LOOP
    SELECT coalesce(jsonb_agg(value),'[]'::jsonb),coalesce(sum((value->>'amount')::numeric),0) INTO lines,total FROM jsonb_array_elements(inv.line_items) WHERE value->>'sale_id' IS DISTINCT FROM s.id::text;
    UPDATE partner_customer_invoices SET line_items=lines,amount=total,document_type=CASE WHEN total>0 THEN 'invoice' ELSE 'subscription_notice' END WHERE id=inv.id;
  END LOOP;
  FOR inv IN SELECT id,line_items FROM tenant_invoices WHERE status='draft' AND issued_at IS NULL AND lexware_invoice_id IS NULL AND (tenant_id=s.tenant_id OR partner_id=s.partner_id) AND line_items @> jsonb_build_array(jsonb_build_object('sale_id',s.id)) LOOP
    SELECT coalesce(jsonb_agg(value),'[]'::jsonb),coalesce(sum((value->>'amount')::numeric),0) INTO lines,total FROM jsonb_array_elements(inv.line_items) WHERE value->>'sale_id' IS DISTINCT FROM s.id::text;
    UPDATE tenant_invoices SET line_items=lines,amount=total,module_total=total,document_type=CASE WHEN total>0 THEN 'invoice' ELSE 'subscription_notice' END WHERE id=inv.id;
  END LOOP;
  UPDATE license_sales SET ended_on=(now() AT TIME ZONE 'Europe/Berlin')::date-1,auto_renew=false,next_period=NULL WHERE id=s.id;
  INSERT INTO license_sale_corrections(sale_id,tenant_id,actor_id,before_data,after_data) VALUES(s.id,s.tenant_id,auth.uid(),to_jsonb(s),jsonb_build_object('action','cancel_mistake','reason',trim(p_reason)));
END
$reversal$;
REVOKE ALL ON FUNCTION public.cancel_mistaken_license_sale(uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.cancel_mistaken_license_sale(uuid,text) TO authenticated;
COMMENT ON FUNCTION public.cancel_mistaken_license_sale(uuid,text) IS 'package_fixed_terms_v1450: preserves cancelled issued documents; complete reversal restore v1454';
NOTIFY pgrst,'reload schema';