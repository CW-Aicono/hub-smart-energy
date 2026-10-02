
CREATE TABLE public.copilot_analytics_queries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  user_id uuid,
  title text NOT NULL,
  prompt text NOT NULL,
  location_id uuid,
  period_start date,
  period_end date,
  result_json jsonb,
  is_pinned boolean NOT NULL DEFAULT false,
  model_used text,
  status text NOT NULL DEFAULT 'completed',
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.copilot_analytics_queries TO authenticated;
GRANT ALL ON public.copilot_analytics_queries TO service_role;

ALTER TABLE public.copilot_analytics_queries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant isolation for copilot_analytics_queries"
  ON public.copilot_analytics_queries
  FOR ALL
  USING (tenant_id = get_user_tenant_id())
  WITH CHECK (tenant_id = get_user_tenant_id());

CREATE POLICY "Partner members can read tenant analytics queries"
  ON public.copilot_analytics_queries
  FOR SELECT
  USING (partner_has_tenant_access(auth.uid(), tenant_id));

CREATE INDEX idx_copilot_analytics_queries_tenant_created
  ON public.copilot_analytics_queries(tenant_id, created_at DESC);

CREATE TRIGGER update_copilot_analytics_queries_updated_at
  BEFORE UPDATE ON public.copilot_analytics_queries
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
