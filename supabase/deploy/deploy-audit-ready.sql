SELECT
 coalesce(obj_description(to_regprocedure('public._finish_tenant_setup(uuid,uuid,text)'), 'pg_proc') LIKE 'deploy_audit_v1442:%',false)
 AND coalesce(obj_description(to_regprocedure('public.set_license_sale_term(uuid,integer,boolean)'), 'pg_proc') LIKE 'deploy_audit_v1442:%',false)
 AND NOT has_function_privilege('anon','public.set_license_sale_term(uuid,integer,boolean)','EXECUTE')
 AND NOT EXISTS(SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='bridge_workers' AND qual='true')
 AND NOT has_table_privilege('anon','public.bridge_workers','SELECT')
 AND (to_regclass('public.meter_daily_totals_mv_repair_backup_20260617') IS NULL OR (
   coalesce((SELECT relrowsecurity FROM pg_class WHERE oid=to_regclass('public.meter_daily_totals_mv_repair_backup_20260617')),false)
   AND NOT EXISTS(SELECT 1 FROM information_schema.table_privileges WHERE table_schema='public' AND table_name='meter_daily_totals_mv_repair_backup_20260617' AND grantee IN ('PUBLIC','anon','authenticated'))
 )) AS deploy_audit_ready;