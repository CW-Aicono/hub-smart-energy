
CREATE TABLE public.charge_point_economics (
  charge_point_id uuid PRIMARY KEY REFERENCES public.charge_points(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  capex_cents bigint NOT NULL DEFAULT 0,
  opex_monthly_cents bigint NOT NULL DEFAULT 0,
  commissioned_on date,
  electricity_cost_eur_per_kwh numeric(8,4) NOT NULL DEFAULT 0.30,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.charge_point_economics TO authenticated;
GRANT ALL ON public.charge_point_economics TO service_role;

ALTER TABLE public.charge_point_economics ENABLE ROW LEVEL SECURITY;

CREATE POLICY "cpe select tenant"
  ON public.charge_point_economics FOR SELECT TO authenticated
  USING (tenant_id = public.get_user_tenant_id() OR public.has_role(auth.uid(), 'super_admin'::app_role));

CREATE POLICY "cpe insert admin"
  ON public.charge_point_economics FOR INSERT TO authenticated
  WITH CHECK (
    (tenant_id = public.get_user_tenant_id() AND public.has_role(auth.uid(), 'admin'::app_role))
    OR public.has_role(auth.uid(), 'super_admin'::app_role)
  );

CREATE POLICY "cpe update admin"
  ON public.charge_point_economics FOR UPDATE TO authenticated
  USING (
    (tenant_id = public.get_user_tenant_id() AND public.has_role(auth.uid(), 'admin'::app_role))
    OR public.has_role(auth.uid(), 'super_admin'::app_role)
  );

CREATE POLICY "cpe delete admin"
  ON public.charge_point_economics FOR DELETE TO authenticated
  USING (
    (tenant_id = public.get_user_tenant_id() AND public.has_role(auth.uid(), 'admin'::app_role))
    OR public.has_role(auth.uid(), 'super_admin'::app_role)
  );

CREATE TRIGGER trg_cpe_updated_at
  BEFORE UPDATE ON public.charge_point_economics
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_cpe_tenant ON public.charge_point_economics(tenant_id);
