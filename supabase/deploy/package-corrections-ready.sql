-- Read-only: true only when package corrections (mistaken-booking reversal) are really installed.
SELECT to_regclass('public.license_sale_corrections') IS NOT NULL
  AND to_regprocedure('public.cancel_mistaken_license_sale(uuid,text)') IS NOT NULL
  AND to_regprocedure('public.correct_license_sale(uuid,numeric,integer,text,numeric,date,date,text,text)') IS NOT NULL
  AND coalesce((SELECT prosecdef AND proconfig @> ARRAY['search_path=public']
    AND proargnames=ARRAY['p_sale','p_reason']::text[]
    AND has_function_privilege('authenticated',oid,'EXECUTE') AND NOT has_function_privilege('anon',oid,'EXECUTE')
    AND prosrc LIKE '%coalesce%' AND prosrc LIKE '%partner_id=s.partner_id%'
    AND prosrc LIKE '%status<>''voided''%' AND prosrc LIKE '%document_type<>''cancellation''%'
    AND prosrc LIKE '%WHERE status=''draft'' AND issued_at IS NULL%'
    FROM pg_proc WHERE oid=to_regprocedure('public.cancel_mistaken_license_sale(uuid,text)')),false)
  AND coalesce((SELECT prosecdef AND proargnames=ARRAY['p_sale','p_price','p_quantity','p_cadence','p_discount','p_from','p_to','p_after','p_reason']::text[]
    AND has_function_privilege('authenticated',oid,'EXECUTE') AND NOT has_function_privilege('anon',oid,'EXECUTE')
    AND prosrc LIKE '%coalesce%' AND prosrc LIKE '%partner_id=s.partner_id%'
    FROM pg_proc WHERE oid=to_regprocedure('public.correct_license_sale(uuid,numeric,integer,text,numeric,date,date,text,text)')),false)
  AS package_corrections_ready;
