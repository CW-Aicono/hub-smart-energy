GRANT SELECT ON public.tenant_modules TO authenticated;
GRANT ALL ON public.tenant_modules TO service_role;
GRANT SELECT ON public.partner_modules TO authenticated;
GRANT ALL ON public.partner_modules TO service_role;
ALTER TABLE public.partner_modules ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='partner_modules' AND policyname='partner_modules_member_select') THEN
    CREATE POLICY partner_modules_member_select ON public.partner_modules FOR SELECT TO authenticated
      USING (EXISTS (SELECT 1 FROM public.partner_members pm WHERE pm.user_id = auth.uid() AND pm.partner_id = partner_modules.partner_id));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='partner_modules' AND policyname='partner_modules_super_admin_all') THEN
    CREATE POLICY partner_modules_super_admin_all ON public.partner_modules FOR ALL TO authenticated
      USING (public.has_role(auth.uid(), 'super_admin'::app_role)) WITH CHECK (public.has_role(auth.uid(), 'super_admin'::app_role));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='tenant_modules' AND policyname='partner_members_read_tenant_modules') THEN
    CREATE POLICY partner_members_read_tenant_modules ON public.tenant_modules FOR SELECT TO authenticated
      USING (EXISTS (SELECT 1 FROM public.tenants t JOIN public.partner_members pm ON pm.partner_id = t.partner_id
                     WHERE t.id = tenant_modules.tenant_id AND pm.user_id = auth.uid()));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='tenant_modules' AND policyname='Super admins can manage tenant modules') THEN
    CREATE POLICY "Super admins can manage tenant modules" ON public.tenant_modules FOR ALL TO authenticated
      USING (public.has_role(auth.uid(), 'super_admin'::app_role)) WITH CHECK (public.has_role(auth.uid(), 'super_admin'::app_role));
  END IF;
END $$;

INSERT INTO public.partner_modules (partner_id, module_code)
SELECT DISTINCT t.partner_id, tm.module_code
FROM public.tenant_modules tm JOIN public.tenants t ON t.id = tm.tenant_id
WHERE tm.is_enabled = true AND t.partner_id IS NOT NULL
ON CONFLICT (partner_id, module_code) DO NOTHING;