
CREATE TABLE public.charging_report_schedules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  created_by uuid NOT NULL,
  name text NOT NULL,
  recipients text[] NOT NULL DEFAULT '{}',
  frequency text NOT NULL CHECK (frequency IN ('daily','weekly','monthly')),
  format text NOT NULL DEFAULT 'csv' CHECK (format IN ('csv','xlsx','pdf')),
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_active boolean NOT NULL DEFAULT true,
  last_sent_at timestamptz,
  next_run_at timestamptz,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.charging_report_schedules TO authenticated;
GRANT ALL ON public.charging_report_schedules TO service_role;

ALTER TABLE public.charging_report_schedules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant members can view charging report schedules"
  ON public.charging_report_schedules FOR SELECT TO authenticated
  USING (
    tenant_id = public.get_user_tenant_id()
    OR public.has_role(auth.uid(),'super_admin')
  );

CREATE POLICY "Tenant members can insert charging report schedules"
  ON public.charging_report_schedules FOR INSERT TO authenticated
  WITH CHECK (
    tenant_id = public.get_user_tenant_id()
    AND created_by = auth.uid()
  );

CREATE POLICY "Tenant members can update charging report schedules"
  ON public.charging_report_schedules FOR UPDATE TO authenticated
  USING (tenant_id = public.get_user_tenant_id())
  WITH CHECK (tenant_id = public.get_user_tenant_id());

CREATE POLICY "Tenant members can delete charging report schedules"
  ON public.charging_report_schedules FOR DELETE TO authenticated
  USING (tenant_id = public.get_user_tenant_id());

CREATE POLICY "Super admin full access charging report schedules"
  ON public.charging_report_schedules FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'super_admin'))
  WITH CHECK (public.has_role(auth.uid(),'super_admin'));

CREATE TRIGGER trg_charging_report_schedules_updated_at
  BEFORE UPDATE ON public.charging_report_schedules
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_charging_report_schedules_due
  ON public.charging_report_schedules(next_run_at)
  WHERE is_active = true;
