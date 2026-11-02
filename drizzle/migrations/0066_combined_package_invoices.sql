CREATE OR REPLACE FUNCTION public.bill_catalog_license_sale(p_sale uuid,p_start date,p_supplement boolean DEFAULT false) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE s license_sales; e date; a numeric; b numeric; ref text; li jsonb; tn text; inv tenant_invoices; ci partner_customer_invoices; inserted integer; booking text;
BEGIN
 SELECT * INTO s FROM license_sales WHERE id=p_sale FOR UPDATE;
 IF NOT FOUND OR (s.ended_on IS NOT NULL AND p_start>s.ended_on) THEN RETURN; END IF;
 e:=license_period_end(p_start,s.cadence); IF s.ended_on IS NOT NULL THEN e:=least(e,s.ended_on); END IF;
 INSERT INTO license_billing_events(sale_id,period_start,period_end) VALUES(s.id,p_start,e) ON CONFLICT DO NOTHING; GET DIAGNOSTICS inserted=ROW_COUNT; IF inserted=0 THEN RETURN; END IF;
 SELECT name INTO tn FROM tenants WHERE id=s.tenant_id;
 a:=license_period_amount(s.sale_price,s.quantity,p_start,e,s.cadence); b:=license_period_amount(s.purchase_price,s.quantity,p_start,e,s.cadence);
 -- The booking UI assigns the same UUID prefix to every item in one submission.
 booking:=s.tenant_id||':'||left(s.request_id::text,24)||':'||p_start;
 li:=jsonb_build_array(jsonb_build_object('type','license','code',s.product_code,'sale_id',s.id,'label',s.label,'quantity',s.quantity,'unit_price',a/s.quantity,'amount',a,'period_start',p_start,'period_end',e));
 IF s.partner_id IS NOT NULL THEN
  ref:='license-booking:'||s.partner_id||':'||booking;
  PERFORM pg_advisory_xact_lock(hashtextextended(ref,0));
  SELECT * INTO ci FROM partner_customer_invoices WHERE source_ref=ref FOR UPDATE;
  IF FOUND AND ci.issued_at IS NULL AND ci.status='draft' THEN
   UPDATE partner_customer_invoices SET amount=amount+a,line_items=line_items||li,period_start=least(period_start,p_start),period_end=greatest(period_end,e),document_type=CASE WHEN amount+a>0 THEN 'invoice' ELSE 'subscription_notice' END WHERE id=ci.id;
  ELSE
   IF FOUND THEN ref:=ref||':'||s.id; END IF;
   INSERT INTO partner_customer_invoices(partner_id,tenant_id,source_ref,period_start,period_end,amount,line_items,document_type,payment_method) VALUES(s.partner_id,s.tenant_id,ref,p_start,e,a,li,CASE WHEN a>0 THEN 'invoice' ELSE 'subscription_notice' END,s.payment_method) ON CONFLICT(source_ref) DO NOTHING;
  END IF;
  a:=b;
 END IF;
 li:=jsonb_build_array(jsonb_build_object('type','license','code',s.product_code,'sale_id',s.id,'label',s.label||' – '||coalesce(tn,''),'quantity',s.quantity,'unit_price',a/s.quantity,'amount',a,'period_start',p_start,'period_end',e));
 IF s.partner_id IS NOT NULL AND NOT p_supplement THEN
  ref:='license-cycle:'||s.partner_id||':'||s.cadence||':'||p_start;
 ELSE
  ref:='license-booking:'||coalesce(s.partner_id::text,'direct')||':'||booking;
 END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(ref,0));
 SELECT * INTO inv FROM tenant_invoices WHERE source_ref=ref AND status<>'voided' FOR UPDATE;
 IF FOUND AND inv.issued_at IS NULL AND inv.lexware_invoice_id IS NULL AND inv.status='draft' THEN
  UPDATE tenant_invoices SET amount=amount+a,module_total=module_total+a,line_items=line_items||li,period_start=least(period_start,p_start),period_end=greatest(period_end,e),document_type=CASE WHEN amount+a>0 THEN 'invoice' ELSE 'subscription_notice' END WHERE id=inv.id;
 ELSE
  IF FOUND THEN ref:=ref||':'||s.id; END IF;
  INSERT INTO tenant_invoices(tenant_id,partner_id,source_ref,invoice_number,invoice_kind,status,document_type,period_start,period_end,amount,module_total,support_total,line_items) VALUES(s.tenant_id,s.partner_id,ref,'DRAFT',CASE WHEN p_supplement OR s.cadence='once' THEN 'one_time' ELSE 'recurring' END,'draft',CASE WHEN a>0 THEN 'invoice' ELSE 'subscription_notice' END,p_start,e,a,a,0,li);
 END IF;
 UPDATE license_sales SET next_period=CASE WHEN cadence='once' THEN NULL ELSE e+1 END WHERE id=s.id;
END $$;
REVOKE ALL ON FUNCTION public.bill_catalog_license_sale(uuid,date,boolean) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.bill_catalog_license_sale(uuid,date,boolean) TO service_role;
COMMENT ON FUNCTION public.bill_catalog_license_sale(uuid,date,boolean) IS 'Combine catalog items by tenant, booking request prefix and billing start; keep billing event idempotency, issued documents and partner wholesale cycles unchanged.';