
-- Charging user groups (e.g. "Mitarbeiter", "Gäste", "Flottenkunden")
CREATE TABLE public.charging_user_groups (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.charging_user_groups ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant users can view their charging user groups"
  ON public.charging_user_groups FOR SELECT
  TO authenticated
  USING (tenant_id = public.get_user_tenant_id());

CREATE POLICY "Admins can manage charging user groups"
  ON public.charging_user_groups FOR ALL
  TO authenticated
  USING (tenant_id = public.get_user_tenant_id() AND public.has_role(auth.uid(), 'admin'))
  WITH CHECK (tenant_id = public.get_user_tenant_id() AND public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER update_charging_user_groups_updated_at
  BEFORE UPDATE ON public.charging_user_groups
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Charging users (EV charging authorized users with RFID etc.)
CREATE TABLE public.charging_users (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  group_id UUID REFERENCES public.charging_user_groups(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  email TEXT,
  rfid_tag TEXT,
  phone TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'blocked', 'archived')),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.charging_users ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant users can view their charging users"
  ON public.charging_users FOR SELECT
  TO authenticated
  USING (tenant_id = public.get_user_tenant_id());

CREATE POLICY "Admins can manage charging users"
  ON public.charging_users FOR ALL
  TO authenticated
  USING (tenant_id = public.get_user_tenant_id() AND public.has_role(auth.uid(), 'admin'))
  WITH CHECK (tenant_id = public.get_user_tenant_id() AND public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER update_charging_users_updated_at
  BEFORE UPDATE ON public.charging_users
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
