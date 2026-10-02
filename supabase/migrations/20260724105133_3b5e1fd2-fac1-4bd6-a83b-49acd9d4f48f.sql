CREATE INDEX IF NOT EXISTS idx_integration_errors_unresolved_tenant
  ON public.integration_errors (tenant_id)
  WHERE resolved_at IS NULL;

ANALYZE public.integration_errors;