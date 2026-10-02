CREATE TABLE public.energy_report_drafts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  report_year integer NOT NULL,
  profile_code text,
  texts jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, report_year)
);

ALTER TABLE public.energy_report_drafts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant users can view drafts"
ON public.energy_report_drafts FOR SELECT TO authenticated
USING (tenant_id = public.get_user_tenant_id());

CREATE POLICY "Tenant users can insert drafts"
ON public.energy_report_drafts FOR INSERT TO authenticated
WITH CHECK (tenant_id = public.get_user_tenant_id());

CREATE POLICY "Tenant users can update drafts"
ON public.energy_report_drafts FOR UPDATE TO authenticated
USING (tenant_id = public.get_user_tenant_id())
WITH CHECK (tenant_id = public.get_user_tenant_id());

CREATE POLICY "Tenant users can delete drafts"
ON public.energy_report_drafts FOR DELETE TO authenticated
USING (tenant_id = public.get_user_tenant_id());

CREATE TRIGGER trg_energy_report_drafts_updated_at
BEFORE UPDATE ON public.energy_report_drafts
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();