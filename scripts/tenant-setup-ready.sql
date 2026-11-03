SELECT
  EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'tenants' AND column_name = 'setup_status' AND column_default = '''setup''::text')
  AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'tenants' AND column_name = 'setup_completed_at')
  AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'tenants' AND column_name = 'setup_completed_by')
  AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'support_sessions' AND column_name = 'session_kind')
  AND to_regprocedure('public.complete_tenant_setup(uuid)') IS NOT NULL
  AND EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_prevent_tenant_setup_reopen' AND tgrelid = 'public.tenants'::regclass AND tgenabled <> 'D')
  AND EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_handover_tenant_on_admin_login' AND tgrelid = 'auth.users'::regclass AND tgenabled <> 'D')
  AND EXISTS (SELECT 1 FROM pg_proc WHERE oid = to_regprocedure('public._finish_tenant_setup(uuid,uuid,text)') AND prosrc LIKE '%actor_user_id%')
  AS tenant_setup_ready;