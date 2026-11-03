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
  VALUES(s.partner_id,s.tenant_id,ref,p_start,e,a,li,CASE WHEN a>0 THEN 'invoice' ELSE 'subscription_notice' END,s.payment_method) ON CONFLICT DO NOTHING;
 ELSE
  INSERT INTO tenant_invoices(tenant_id,source_ref,invoice_number,invoice_kind,status,document_type,period_start,period_end,amount,module_total,support_total,line_items)
  VALUES(s.tenant_id,ref,'DRAFT',CASE WHEN s.cadence='once' THEN 'one_time' ELSE 'recurring' END,'draft',CASE WHEN a>0 THEN 'invoice' ELSE 'subscription_notice' END,p_start,e,a,a,0,li) ON CONFLICT DO NOTHING;
 END IF;
 UPDATE license_sales SET next_period=CASE WHEN cadence='once' THEN NULL ELSE e+1 END WHERE id=s.id;
END $$;
REVOKE ALL ON FUNCTION public.bill_license_sale(uuid,date,boolean) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.bill_license_sale(uuid,date,boolean) TO service_role;