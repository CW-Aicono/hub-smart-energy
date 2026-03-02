
-- 1. energy_measures table
CREATE TABLE public.energy_measures (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  location_id UUID NOT NULL REFERENCES public.locations(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  category TEXT NOT NULL DEFAULT 'sonstiges',
  implementation_date DATE,
  investment_cost NUMERIC,
  estimated_annual_savings_kwh NUMERIC,
  estimated_annual_savings_eur NUMERIC,
  energy_type TEXT,
  status TEXT NOT NULL DEFAULT 'planned',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.energy_measures ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant users can view measures"
  ON public.energy_measures FOR SELECT
  TO authenticated
  USING (tenant_id = public.get_user_tenant_id());

CREATE POLICY "Admins can insert measures"
  ON public.energy_measures FOR INSERT
  TO authenticated
  WITH CHECK (tenant_id = public.get_user_tenant_id());

CREATE POLICY "Admins can update measures"
  ON public.energy_measures FOR UPDATE
  TO authenticated
  USING (tenant_id = public.get_user_tenant_id());

CREATE POLICY "Admins can delete measures"
  ON public.energy_measures FOR DELETE
  TO authenticated
  USING (tenant_id = public.get_user_tenant_id());

CREATE TRIGGER update_energy_measures_updated_at
  BEFORE UPDATE ON public.energy_measures
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- 2. energy_report_archive table
CREATE TABLE public.energy_report_archive (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  report_year INTEGER NOT NULL,
  title TEXT NOT NULL,
  location_ids UUID[] NOT NULL DEFAULT '{}',
  generated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  generated_by UUID,
  report_config JSONB,
  pdf_storage_path TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.energy_report_archive ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant users can view archived reports"
  ON public.energy_report_archive FOR SELECT
  TO authenticated
  USING (tenant_id = public.get_user_tenant_id());

CREATE POLICY "Admins can insert archived reports"
  ON public.energy_report_archive FOR INSERT
  TO authenticated
  WITH CHECK (tenant_id = public.get_user_tenant_id());

CREATE POLICY "Admins can delete archived reports"
  ON public.energy_report_archive FOR DELETE
  TO authenticated
  USING (tenant_id = public.get_user_tenant_id());

-- 3. Add primary_energy_factor to co2_emission_factors
ALTER TABLE public.co2_emission_factors
  ADD COLUMN primary_energy_factor NUMERIC;
