DO $$ DECLARE d text; BEGIN
SELECT pg_get_functiondef('public.correct_license_sale(uuid,numeric,integer,text,numeric,date,date,text,text)'::regprocedure) INTO d; d:=replace(d,'FROM tenant_invoices WHERE tenant_id=s.tenant_id AND line_items','FROM tenant_invoices WHERE (tenant_id=s.tenant_id OR partner_id=s.partner_id) AND line_items'); EXECUTE d;
SELECT pg_get_functiondef('public.cancel_mistaken_license_sale(uuid,text)'::regprocedure) INTO d; d:=replace(d,'FROM tenant_invoices WHERE tenant_id=s.tenant_id AND line_items','FROM tenant_invoices WHERE (tenant_id=s.tenant_id OR partner_id=s.partner_id) AND line_items'); EXECUTE d;
END $$;
NOTIFY pgrst,'reload schema';