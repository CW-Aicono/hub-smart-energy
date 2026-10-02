CREATE INDEX IF NOT EXISTS idx_meter_period_totals_tenant_type_start
ON public.meter_period_totals (tenant_id, period_type, energy_type, period_start DESC)
INCLUDE (total_value, meter_id);