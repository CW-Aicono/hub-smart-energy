CREATE TABLE public.analysis_workspace_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  category text NOT NULL DEFAULT 'general',
  icon text,
  blocks jsonb NOT NULL DEFAULT '[]'::jsonb,
  layout jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_system boolean NOT NULL DEFAULT false,
  tenant_id uuid,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.analysis_workspace_templates TO authenticated;
GRANT ALL ON public.analysis_workspace_templates TO service_role;

ALTER TABLE public.analysis_workspace_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Read system or own tenant templates"
  ON public.analysis_workspace_templates FOR SELECT
  TO authenticated
  USING (is_system = true OR tenant_id = get_user_tenant_id());

CREATE POLICY "Tenant members can create tenant templates"
  ON public.analysis_workspace_templates FOR INSERT
  TO authenticated
  WITH CHECK (is_system = false AND tenant_id = get_user_tenant_id() AND created_by = auth.uid());

CREATE POLICY "Creators can update own tenant templates"
  ON public.analysis_workspace_templates FOR UPDATE
  TO authenticated
  USING (is_system = false AND tenant_id = get_user_tenant_id() AND created_by = auth.uid())
  WITH CHECK (is_system = false AND tenant_id = get_user_tenant_id());

CREATE POLICY "Creators can delete own tenant templates"
  ON public.analysis_workspace_templates FOR DELETE
  TO authenticated
  USING (is_system = false AND tenant_id = get_user_tenant_id() AND created_by = auth.uid());

CREATE POLICY "Super admins manage system templates"
  ON public.analysis_workspace_templates FOR ALL
  TO authenticated
  USING (has_role(auth.uid(), 'super_admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'super_admin'::app_role));

CREATE INDEX idx_analysis_workspace_templates_tenant ON public.analysis_workspace_templates(tenant_id) WHERE tenant_id IS NOT NULL;
CREATE INDEX idx_analysis_workspace_templates_system ON public.analysis_workspace_templates(is_system) WHERE is_system = true;