
-- Table to track which bundles are assigned to a tenant
CREATE TABLE public.tenant_bundles (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  bundle_id UUID NOT NULL REFERENCES public.module_bundles(id) ON DELETE CASCADE,
  assigned_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, bundle_id)
);

ALTER TABLE public.tenant_bundles ENABLE ROW LEVEL SECURITY;

-- Super admins can manage tenant bundles
CREATE POLICY "Super admins can manage tenant_bundles"
  ON public.tenant_bundles
  FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'));

-- Tenant users can view their own bundles
CREATE POLICY "Tenant users can view own bundles"
  ON public.tenant_bundles
  FOR SELECT
  TO authenticated
  USING (tenant_id = public.get_user_tenant_id());
