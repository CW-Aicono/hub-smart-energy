-- Read-only: true only when package corrections (mistaken-booking reversal) are really installed.
SELECT to_regclass('public.license_sale_corrections') IS NOT NULL
  AND to_regprocedure('public.cancel_mistaken_license_sale(uuid,text)') IS NOT NULL
  AND to_regprocedure('public.correct_license_sale(uuid,numeric,integer,text,numeric,date,date,text,text)') IS NOT NULL
  AND coalesce((SELECT prosrc LIKE '%coalesce%' AND prosrc LIKE '%partner_id=s.partner_id%' FROM pg_proc WHERE oid=to_regprocedure('public.cancel_mistaken_license_sale(uuid,text)')),false)
  AND coalesce((SELECT prosrc LIKE '%coalesce%' AND prosrc LIKE '%partner_id=s.partner_id%' FROM pg_proc WHERE oid=to_regprocedure('public.correct_license_sale(uuid,numeric,integer,text,numeric,date,date,text,text)')),false);
