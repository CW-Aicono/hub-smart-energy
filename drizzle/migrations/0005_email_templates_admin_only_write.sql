DROP POLICY IF EXISTS "Admins can insert email templates" ON public.email_templates;
DROP POLICY IF EXISTS "Admins can update email templates" ON public.email_templates;
DROP POLICY IF EXISTS "Admins can delete email templates" ON public.email_templates;

CREATE POLICY "Admins can insert email templates" ON public.email_templates FOR INSERT TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'super_admin'::app_role)
  OR (public.has_role(auth.uid(), 'admin'::app_role) AND tenant_id = public.get_user_tenant_id()));
CREATE POLICY "Admins can update email templates" ON public.email_templates FOR UPDATE TO authenticated
USING (public.has_role(auth.uid(), 'super_admin'::app_role)
  OR (public.has_role(auth.uid(), 'admin'::app_role) AND tenant_id = public.get_user_tenant_id()))
WITH CHECK (public.has_role(auth.uid(), 'super_admin'::app_role)
  OR (public.has_role(auth.uid(), 'admin'::app_role) AND tenant_id = public.get_user_tenant_id()));
CREATE POLICY "Admins can delete email templates" ON public.email_templates FOR DELETE TO authenticated
USING (public.has_role(auth.uid(), 'super_admin'::app_role)
  OR (public.has_role(auth.uid(), 'admin'::app_role) AND tenant_id = public.get_user_tenant_id()));
