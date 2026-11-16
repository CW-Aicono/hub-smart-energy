DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['community_members','community_member_readings_15min','community_allocations_15min','community_member_invoices'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS "Tenant members manage own community members" ON public.%I', t);
    EXECUTE format('DROP POLICY IF EXISTS "Tenant manages own readings" ON public.%I', t);
    EXECUTE format('DROP POLICY IF EXISTS "Tenant manages own allocations" ON public.%I', t);
    EXECUTE format('DROP POLICY IF EXISTS "Tenant manages own invoices" ON public.%I', t);
    EXECUTE format('DROP POLICY IF EXISTS tenant_select_scoped ON public.%I', t);
    EXECUTE format('DROP POLICY IF EXISTS tenant_admin_write_scoped ON public.%I', t);
    EXECUTE format('CREATE POLICY tenant_select_scoped ON public.%I FOR SELECT TO authenticated USING (tenant_id = public.get_user_tenant_id() OR public.has_role(auth.uid(), ''super_admin''::public.app_role))', t);
    EXECUTE format('CREATE POLICY tenant_admin_write_scoped ON public.%I FOR ALL TO authenticated USING ((tenant_id = public.get_user_tenant_id() AND public.has_role(auth.uid(), ''admin''::public.app_role)) OR public.has_role(auth.uid(), ''super_admin''::public.app_role)) WITH CHECK ((tenant_id = public.get_user_tenant_id() AND public.has_role(auth.uid(), ''admin''::public.app_role)) OR public.has_role(auth.uid(), ''super_admin''::public.app_role))', t);
  END LOOP;
END $$;

-- Members may update onboarding fields but never their allocation share.
CREATE OR REPLACE FUNCTION public.protect_community_member_share()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NOT NULL
     AND NOT public.has_role(auth.uid(), 'super_admin'::public.app_role)
     AND NOT (NEW.tenant_id = public.get_user_tenant_id() AND public.has_role(auth.uid(), 'admin'::public.app_role)) THEN
    NEW.share_kw := OLD.share_kw;
    NEW.role := OLD.role;
    NEW.status := OLD.status;
    NEW.tenant_id := OLD.tenant_id;
    NEW.community_id := OLD.community_id;
    NEW.email := OLD.email;
    NEW.user_id := OLD.user_id;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_protect_community_member_share ON public.community_members;
CREATE TRIGGER trg_protect_community_member_share BEFORE UPDATE ON public.community_members
  FOR EACH ROW EXECUTE FUNCTION public.protect_community_member_share();

DROP POLICY IF EXISTS "Tenant members can view workspaces" ON public.analysis_workspaces;
CREATE POLICY "Tenant members can view workspaces" ON public.analysis_workspaces FOR SELECT TO authenticated
USING (tenant_id = public.get_user_tenant_id() AND (created_by = auth.uid() OR is_shared = true OR EXISTS (
  SELECT 1 FROM public.analysis_workspace_shares s WHERE s.workspace_id = analysis_workspaces.id AND s.user_id = auth.uid())));

DROP POLICY IF EXISTS "Authenticated users can view permissions" ON public.permissions;
CREATE POLICY "Authenticated users can view permissions" ON public.permissions FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.user_id = auth.uid()) OR EXISTS (SELECT 1 FROM public.user_roles r WHERE r.user_id = auth.uid()));
DROP POLICY IF EXISTS "Authenticated users can view role permissions" ON public.role_permissions;
CREATE POLICY "Authenticated users can view role permissions" ON public.role_permissions FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.user_id = auth.uid()) OR EXISTS (SELECT 1 FROM public.user_roles r WHERE r.user_id = auth.uid()));

DROP POLICY IF EXISTS "Authenticated can read loxone-master" ON storage.objects;
CREATE POLICY "Authenticated can read loxone-master" ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'loxone-master' AND (public.has_role(auth.uid(), 'super_admin'::public.app_role) OR public.can_portal_read(auth.uid(), 'technical')));
DROP POLICY IF EXISTS "Authenticated read firmware metadata" ON storage.objects;
CREATE POLICY "Authenticated read firmware metadata" ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'cp-firmware' AND (public.has_role(auth.uid(), 'super_admin'::public.app_role) OR public.can_portal_read(auth.uid(), 'technical')));
DROP POLICY IF EXISTS "loxone-manuals read for authenticated" ON storage.objects;
CREATE POLICY "loxone-manuals read for authenticated" ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'loxone-manuals' AND (public.get_user_tenant_id() IS NOT NULL OR public.has_role(auth.uid(), 'super_admin'::public.app_role) OR public.can_portal_read(auth.uid(), 'technical')));