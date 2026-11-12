SELECT coalesce(obj_description(to_regprocedure('public.preflight_license_sale(uuid,text,text,integer,text,numeric,date,text,uuid)'),'pg_proc') LIKE 'package_fixed_terms_v1450:%',false)
 AND coalesce(obj_description(to_regprocedure('public.cancel_mistaken_license_sale(uuid,text)'),'pg_proc') LIKE 'package_fixed_terms_v1450:%',false)
 AND to_regprocedure('public.finalize_license_sale_total(uuid,text,text,integer,numeric,date,text,uuid,numeric,integer,numeric,text)') IS NOT NULL
 AND EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='license_sales' AND column_name='negotiated_once_total')
 AND coalesce(pg_get_functiondef(to_regprocedure('public.bill_catalog_license_sale(uuid,date,boolean)')) LIKE '%coalesce(s.negotiated_once_total,%',false)
 AS package_fixed_terms_ready;