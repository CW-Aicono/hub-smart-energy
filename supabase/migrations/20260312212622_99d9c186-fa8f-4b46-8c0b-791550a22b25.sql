
-- 1. copilot_analyses
CREATE TABLE public.copilot_analyses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  location_id UUID REFERENCES public.locations(id) ON DELETE SET NULL,
  analysis_type TEXT NOT NULL DEFAULT 'single_location',
  input_params JSONB DEFAULT '{}',
  recommendations JSONB DEFAULT '[]',
  funding_matches JSONB DEFAULT '[]',
  roi_scenarios JSONB DEFAULT '[]',
  total_investment NUMERIC DEFAULT 0,
  total_funding NUMERIC DEFAULT 0,
  best_roi_years NUMERIC,
  status TEXT NOT NULL DEFAULT 'draft',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID
);

ALTER TABLE public.copilot_analyses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant isolation for copilot_analyses"
  ON public.copilot_analyses FOR ALL
  TO authenticated
  USING (tenant_id = public.get_user_tenant_id())
  WITH CHECK (tenant_id = public.get_user_tenant_id());

-- 2. funding_programs (global, not tenant-scoped)
CREATE TABLE public.funding_programs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  level TEXT NOT NULL DEFAULT 'bund',
  state TEXT,
  municipality TEXT,
  technology TEXT[] DEFAULT '{}',
  funding_type TEXT NOT NULL DEFAULT 'zuschuss',
  amount_description TEXT,
  max_amount NUMERIC,
  min_capacity NUMERIC,
  valid_from DATE DEFAULT CURRENT_DATE,
  valid_until DATE,
  url TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.funding_programs ENABLE ROW LEVEL SECURITY;

-- Readable by all authenticated users, writable by admins
CREATE POLICY "Anyone can read funding_programs"
  ON public.funding_programs FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Admins can manage funding_programs"
  ON public.funding_programs FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin'));

-- 3. copilot_projects
CREATE TABLE public.copilot_projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  analysis_id UUID REFERENCES public.copilot_analyses(id) ON DELETE SET NULL,
  location_id UUID REFERENCES public.locations(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  technology TEXT,
  priority INTEGER DEFAULT 1,
  estimated_investment NUMERIC DEFAULT 0,
  estimated_funding NUMERIC DEFAULT 0,
  estimated_roi_years NUMERIC,
  estimated_savings_year NUMERIC DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'planned',
  target_year INTEGER,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.copilot_projects ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant isolation for copilot_projects"
  ON public.copilot_projects FOR ALL
  TO authenticated
  USING (tenant_id = public.get_user_tenant_id())
  WITH CHECK (tenant_id = public.get_user_tenant_id());
