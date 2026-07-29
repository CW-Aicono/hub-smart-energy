GRANT SELECT, INSERT, UPDATE, DELETE ON public.analysis_workspaces TO authenticated;
GRANT ALL ON public.analysis_workspaces TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.analysis_workspace_shares TO authenticated;
GRANT ALL ON public.analysis_workspace_shares TO service_role;

ALTER TABLE public.analysis_workspaces ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.analysis_workspace_shares ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant members can view workspaces"
  ON public.analysis_workspaces
  FOR SELECT
  TO authenticated
  USING (tenant_id = public.get_user_tenant_id());

CREATE POLICY "Tenant members can create workspaces"
  ON public.analysis_workspaces
  FOR INSERT
  TO authenticated
  WITH CHECK (tenant_id = public.get_user_tenant_id());

CREATE POLICY "Creators and editors can update workspaces"
  ON public.analysis_workspaces
  FOR UPDATE
  TO authenticated
  USING (
    tenant_id = public.get_user_tenant_id()
    AND (
      created_by = auth.uid()
      OR is_shared = true
      OR EXISTS (
        SELECT 1 FROM public.analysis_workspace_shares s
        WHERE s.workspace_id = id AND s.user_id = auth.uid() AND s.can_edit = true
      )
    )
  )
  WITH CHECK (tenant_id = public.get_user_tenant_id());

CREATE POLICY "Creators can delete workspaces"
  ON public.analysis_workspaces
  FOR DELETE
  TO authenticated
  USING (tenant_id = public.get_user_tenant_id() AND created_by = auth.uid());

CREATE POLICY "Workspace creators and editors can manage shares"
  ON public.analysis_workspace_shares
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.analysis_workspaces w
      WHERE w.id = workspace_id
        AND w.tenant_id = public.get_user_tenant_id()
        AND (w.created_by = auth.uid() OR w.is_shared = true)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.analysis_workspaces w
      WHERE w.id = workspace_id
        AND w.tenant_id = public.get_user_tenant_id()
        AND (w.created_by = auth.uid() OR w.is_shared = true)
    )
  );

CREATE OR REPLACE FUNCTION public.update_analysis_workspace_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_analysis_workspace_updated_at
  BEFORE UPDATE ON public.analysis_workspaces
  FOR EACH ROW
  EXECUTE FUNCTION public.update_analysis_workspace_updated_at();