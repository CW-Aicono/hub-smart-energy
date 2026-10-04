DROP POLICY IF EXISTS "Tenant members manage own community tariffs" ON public.community_tariffs;
DROP POLICY IF EXISTS "community_tariffs_member_select" ON public.community_tariffs;
DROP POLICY IF EXISTS "community_tariffs_admin_write" ON public.community_tariffs;
CREATE POLICY "community_tariffs_member_select" ON public.community_tariffs FOR SELECT TO authenticated
USING (tenant_id = public.get_user_tenant_id() OR public.has_role(auth.uid(), 'super_admin'));
CREATE POLICY "community_tariffs_admin_write" ON public.community_tariffs FOR ALL TO authenticated
USING ((tenant_id = public.get_user_tenant_id() AND public.has_role(auth.uid(), 'admin')) OR public.has_role(auth.uid(), 'super_admin'))
WITH CHECK ((tenant_id = public.get_user_tenant_id() AND public.has_role(auth.uid(), 'admin')) OR public.has_role(auth.uid(), 'super_admin'));