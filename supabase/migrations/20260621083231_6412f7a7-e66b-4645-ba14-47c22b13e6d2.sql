CREATE INDEX IF NOT EXISTS idx_cp_uptime_snapshots_cp_recorded
  ON public.charge_point_uptime_snapshots (charge_point_id, recorded_at DESC);

CREATE INDEX IF NOT EXISTS idx_node_metrics_node_recorded
  ON public.node_metrics (node_name, recorded_at DESC);

CREATE INDEX IF NOT EXISTS idx_integration_errors_open_per_tenant
  ON public.integration_errors (tenant_id)
  WHERE is_resolved = false AND is_ignored = false;