ALTER TABLE public.tenant_savings_baselines
  ADD COLUMN IF NOT EXISTS coverage_months INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS data_quality TEXT NOT NULL DEFAULT 'unknown',
  ADD COLUMN IF NOT EXISTS calculation_details JSONB NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public.tenant_savings_baselines
  DROP CONSTRAINT IF EXISTS tenant_savings_baselines_data_quality_check;

ALTER TABLE public.tenant_savings_baselines
  ADD CONSTRAINT tenant_savings_baselines_data_quality_check
  CHECK (data_quality IN ('complete', 'partial', 'none', 'manual', 'unknown'));

COMMENT ON COLUMN public.tenant_savings_baselines.coverage_months IS 'Number of distinct months with source data used for this baseline.';
COMMENT ON COLUMN public.tenant_savings_baselines.data_quality IS 'Data quality status for tenant-facing baseline traceability.';
COMMENT ON COLUMN public.tenant_savings_baselines.calculation_details IS 'Non-sensitive calculation metadata for explaining baseline derivation.';