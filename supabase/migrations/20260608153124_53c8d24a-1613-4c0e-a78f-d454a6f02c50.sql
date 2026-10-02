
CREATE TABLE public.charging_billing_groups (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  company_name TEXT,
  billing_email TEXT,
  billing_address TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_charging_billing_groups_tenant ON public.charging_billing_groups(tenant_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.charging_billing_groups TO authenticated;
GRANT ALL ON public.charging_billing_groups TO service_role;
ALTER TABLE public.charging_billing_groups ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage billing groups" ON public.charging_billing_groups
  FOR ALL TO authenticated
  USING (tenant_id = get_user_tenant_id() AND has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (tenant_id = get_user_tenant_id() AND has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Tenant users view billing groups" ON public.charging_billing_groups
  FOR SELECT TO authenticated
  USING (tenant_id = get_user_tenant_id());
CREATE POLICY "Super admins view all billing groups" ON public.charging_billing_groups
  FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'super_admin'::app_role));
CREATE POLICY "Partner members read billing groups" ON public.charging_billing_groups
  FOR SELECT TO authenticated
  USING (partner_has_tenant_access(auth.uid(), tenant_id));

CREATE TRIGGER update_charging_billing_groups_updated_at
  BEFORE UPDATE ON public.charging_billing_groups
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.charging_billing_group_members (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  group_id UUID NOT NULL REFERENCES public.charging_billing_groups(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.charging_users(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(group_id, user_id)
);
CREATE INDEX idx_billing_group_members_group ON public.charging_billing_group_members(group_id);
CREATE INDEX idx_billing_group_members_user ON public.charging_billing_group_members(user_id);
CREATE INDEX idx_billing_group_members_tenant ON public.charging_billing_group_members(tenant_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.charging_billing_group_members TO authenticated;
GRANT ALL ON public.charging_billing_group_members TO service_role;
ALTER TABLE public.charging_billing_group_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage billing group members" ON public.charging_billing_group_members
  FOR ALL TO authenticated
  USING (tenant_id = get_user_tenant_id() AND has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (tenant_id = get_user_tenant_id() AND has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Tenant users view billing group members" ON public.charging_billing_group_members
  FOR SELECT TO authenticated
  USING (tenant_id = get_user_tenant_id());
CREATE POLICY "Super admins view all billing group members" ON public.charging_billing_group_members
  FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'super_admin'::app_role));
CREATE POLICY "Partner members read billing group members" ON public.charging_billing_group_members
  FOR SELECT TO authenticated
  USING (partner_has_tenant_access(auth.uid(), tenant_id));
