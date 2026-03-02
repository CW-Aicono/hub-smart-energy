
-- Phase 1: Extend locations table with building master data
ALTER TABLE public.locations
  ADD COLUMN IF NOT EXISTS construction_year integer,
  ADD COLUMN IF NOT EXISTS renovation_year integer,
  ADD COLUMN IF NOT EXISTS net_floor_area numeric,
  ADD COLUMN IF NOT EXISTS gross_floor_area numeric,
  ADD COLUMN IF NOT EXISTS heating_type text,
  ADD COLUMN IF NOT EXISTS photo_url text;

-- Phase 2: CO2 emission factors table
CREATE TABLE public.co2_emission_factors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  energy_type text NOT NULL,
  factor_kg_per_kwh numeric NOT NULL DEFAULT 0,
  factor_kg_per_m3 numeric,
  source text,
  valid_from date NOT NULL DEFAULT CURRENT_DATE,
  valid_until date,
  is_default boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.co2_emission_factors ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant users can view co2 factors"
  ON public.co2_emission_factors FOR SELECT
  TO authenticated
  USING (tenant_id = public.get_user_tenant_id());

CREATE POLICY "Admins can insert co2 factors"
  ON public.co2_emission_factors FOR INSERT
  TO authenticated
  WITH CHECK (
    tenant_id = public.get_user_tenant_id()
    AND public.has_role(auth.uid(), 'admin'::app_role)
  );

CREATE POLICY "Admins can update co2 factors"
  ON public.co2_emission_factors FOR UPDATE
  TO authenticated
  USING (
    tenant_id = public.get_user_tenant_id()
    AND public.has_role(auth.uid(), 'admin'::app_role)
  );

CREATE POLICY "Admins can delete co2 factors"
  ON public.co2_emission_factors FOR DELETE
  TO authenticated
  USING (
    tenant_id = public.get_user_tenant_id()
    AND public.has_role(auth.uid(), 'admin'::app_role)
  );

CREATE TRIGGER update_co2_emission_factors_updated_at
  BEFORE UPDATE ON public.co2_emission_factors
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Phase 3: Energy benchmarks table (not tenant-scoped, global reference data)
CREATE TABLE public.energy_benchmarks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  usage_type text NOT NULL,
  energy_type text NOT NULL,
  target_value numeric NOT NULL,
  average_value numeric NOT NULL,
  high_value numeric NOT NULL,
  unit text NOT NULL DEFAULT 'kWh/m²a',
  source text,
  valid_year integer NOT NULL DEFAULT 2024
);

ALTER TABLE public.energy_benchmarks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone authenticated can read benchmarks"
  ON public.energy_benchmarks FOR SELECT
  TO authenticated
  USING (true);

-- Only super_admins can manage benchmarks
CREATE POLICY "Super admins can manage benchmarks"
  ON public.energy_benchmarks FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'::app_role));
