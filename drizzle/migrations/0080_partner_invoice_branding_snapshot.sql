-- Preserve the existing authorization/accounting implementation; only enrich the sender read.
DO $migration$
DECLARE definition text;
BEGIN
 SELECT pg_get_functiondef('public.issue_partner_customer_invoice(uuid)'::regprocedure) INTO definition;
 IF position('invoice_branding_snapshot' in definition) = 0 THEN
   IF position('SELECT settings INTO s FROM partner_billing_settings WHERE partner_id=i.partner_id;' in definition) = 0 THEN
     RAISE EXCEPTION 'Partner invoice sender read differs from expected release contract';
   END IF;
   definition := replace(definition,
     'SELECT settings INTO s FROM partner_billing_settings WHERE partner_id=i.partner_id;',
     '/* invoice_branding_snapshot: frozen only on initial issuance */
 SELECT b.settings || jsonb_build_object(''logo_url'',p.logo_url,''primary_color'',p.primary_color,''secondary_color'',p.secondary_color,''accent_color'',p.accent_color) INTO s
 FROM public.partner_billing_settings b JOIN public.partners p ON p.id=b.partner_id WHERE b.partner_id=i.partner_id;');
   EXECUTE definition;
 END IF;
END $migration$;
NOTIFY pgrst, 'reload schema';