
-- 2. Create tenant_modules table
CREATE TABLE public.tenant_modules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  module_code text NOT NULL,
  is_enabled boolean NOT NULL DEFAULT true,
  enabled_at timestamptz DEFAULT now(),
  disabled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, module_code)
);

ALTER TABLE public.tenant_modules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admins can manage tenant modules"
  ON public.tenant_modules FOR ALL
  USING (has_role(auth.uid(), 'super_admin'::app_role));

CREATE POLICY "Tenants can view own modules"
  ON public.tenant_modules FOR SELECT
  USING (tenant_id = get_user_tenant_id());

-- 3. Create tenant_licenses table
CREATE TABLE public.tenant_licenses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  plan_name text NOT NULL DEFAULT 'basic',
  price_monthly numeric NOT NULL DEFAULT 0,
  price_yearly numeric NOT NULL DEFAULT 0,
  billing_cycle text NOT NULL DEFAULT 'monthly',
  valid_from timestamptz NOT NULL DEFAULT now(),
  valid_until timestamptz,
  status text NOT NULL DEFAULT 'active',
  max_users integer NOT NULL DEFAULT 5,
  max_locations integer NOT NULL DEFAULT 3,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.tenant_licenses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admins can manage tenant licenses"
  ON public.tenant_licenses FOR ALL
  USING (has_role(auth.uid(), 'super_admin'::app_role));

CREATE POLICY "Tenants can view own license"
  ON public.tenant_licenses FOR SELECT
  USING (tenant_id = get_user_tenant_id());

-- 4. Create tenant_invoices table
CREATE TABLE public.tenant_invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  invoice_number text NOT NULL,
  period_start date NOT NULL,
  period_end date NOT NULL,
  amount numeric NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'draft',
  pdf_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.tenant_invoices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admins can manage invoices"
  ON public.tenant_invoices FOR ALL
  USING (has_role(auth.uid(), 'super_admin'::app_role));

CREATE POLICY "Tenants can view own invoices"
  ON public.tenant_invoices FOR SELECT
  USING (tenant_id = get_user_tenant_id());

-- 5. Create platform_statistics table
CREATE TABLE public.platform_statistics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE,
  metric_type text NOT NULL,
  value numeric NOT NULL DEFAULT 0,
  recorded_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.platform_statistics ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admins can manage statistics"
  ON public.platform_statistics FOR ALL
  USING (has_role(auth.uid(), 'super_admin'::app_role));

-- 6. Create support_sessions table
CREATE TABLE public.support_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  super_admin_user_id uuid NOT NULL,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  started_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.support_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admins can manage support sessions"
  ON public.support_sessions FOR ALL
  USING (has_role(auth.uid(), 'super_admin'::app_role));

-- 7. Super-admin SELECT policies on existing tables
CREATE POLICY "Super admins can view all tenants"
  ON public.tenants FOR SELECT
  USING (has_role(auth.uid(), 'super_admin'::app_role));

CREATE POLICY "Super admins can insert tenants"
  ON public.tenants FOR INSERT
  WITH CHECK (has_role(auth.uid(), 'super_admin'::app_role));

CREATE POLICY "Super admins can update all tenants"
  ON public.tenants FOR UPDATE
  USING (has_role(auth.uid(), 'super_admin'::app_role));

CREATE POLICY "Super admins can delete tenants"
  ON public.tenants FOR DELETE
  USING (has_role(auth.uid(), 'super_admin'::app_role));

CREATE POLICY "Super admins can view all profiles"
  ON public.profiles FOR SELECT
  USING (has_role(auth.uid(), 'super_admin'::app_role));

CREATE POLICY "Super admins can view all locations"
  ON public.locations FOR SELECT
  USING (has_role(auth.uid(), 'super_admin'::app_role));

CREATE POLICY "Super admins can view all user roles"
  ON public.user_roles FOR SELECT
  USING (has_role(auth.uid(), 'super_admin'::app_role));

-- 8. Triggers for updated_at
CREATE TRIGGER update_tenant_modules_updated_at
  BEFORE UPDATE ON public.tenant_modules
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_tenant_licenses_updated_at
  BEFORE UPDATE ON public.tenant_licenses
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_tenant_invoices_updated_at
  BEFORE UPDATE ON public.tenant_invoices
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
