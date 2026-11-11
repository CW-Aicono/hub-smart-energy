SELECT EXISTS (
  SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='public' AND p.proname='create_quoted_manual_invoice'
    AND pg_get_function_identity_arguments(p.oid)='p_tenant_id uuid, p_partner_id uuid, p_lines jsonb, p_options jsonb'
    AND obj_description(p.oid,'pg_proc') LIKE 'manual_invoice_options_v1440:%'
    AND p.prosecdef AND p.proconfig @> ARRAY['search_path=public']
    AND has_function_privilege('authenticated',p.oid,'EXECUTE')
    AND NOT has_function_privilege('anon',p.oid,'EXECUTE')
) AS manual_invoice_ready;