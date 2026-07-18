-- 1. meter_period_totals: covers filter (tenant_id, period_type, energy_type) with range on period_start
CREATE INDEX IF NOT EXISTS idx_mpt_tenant_ptype_etype_pstart
  ON public.meter_period_totals (tenant_id, period_type, energy_type, period_start);

-- 2. meter_power_readings: covers meter_id + recorded_at range + power_value ordering
CREATE INDEX IF NOT EXISTS idx_mpr_meter_recorded
  ON public.meter_power_readings (meter_id, recorded_at DESC);

-- 3. integration_errors: dashboard filter path (tenant_id, is_resolved, is_ignored) sorted by created_at DESC
CREATE INDEX IF NOT EXISTS idx_ierr_tenant_open_created
  ON public.integration_errors (tenant_id, created_at DESC)
  WHERE is_resolved = false AND is_ignored = false;
