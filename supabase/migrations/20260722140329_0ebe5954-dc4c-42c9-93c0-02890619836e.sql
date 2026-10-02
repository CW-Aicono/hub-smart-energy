CREATE INDEX IF NOT EXISTS idx_integration_errors_tenant_open_created
  ON public.integration_errors (tenant_id, is_resolved, is_ignored, created_at DESC);