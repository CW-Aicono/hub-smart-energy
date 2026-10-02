
CREATE TABLE public.ppa_settlements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  contract_id uuid NOT NULL REFERENCES public.ppa_contracts(id) ON DELETE CASCADE,
  period_start date NOT NULL,
  period_end date NOT NULL,
  delivered_kwh numeric(14,3) NOT NULL DEFAULT 0,
  consumed_kwh numeric(14,3) NOT NULL DEFAULT 0,
  avg_spot_price_eur_kwh numeric(10,5),
  applied_avg_price_eur_kwh numeric(10,5),
  total_amount_eur numeric(14,2) NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'EUR',
  status text NOT NULL DEFAULT 'draft',
  breakdown jsonb,
  error text,
  computed_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ppa_settlements_period_unique UNIQUE (contract_id, period_start),
  CONSTRAINT ppa_settlements_status_check CHECK (status IN ('draft','finalized','invoiced','error'))
);

CREATE INDEX idx_ppa_settlements_tenant ON public.ppa_settlements(tenant_id);
CREATE INDEX idx_ppa_settlements_contract ON public.ppa_settlements(contract_id, period_start DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.ppa_settlements TO authenticated;
GRANT ALL ON public.ppa_settlements TO service_role;

ALTER TABLE public.ppa_settlements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant members can view ppa settlements"
ON public.ppa_settlements FOR SELECT TO authenticated
USING (tenant_id = public.get_user_tenant_id() OR public.has_role(auth.uid(), 'super_admin'::public.app_role));

CREATE POLICY "Admins can insert ppa settlements"
ON public.ppa_settlements FOR INSERT TO authenticated
WITH CHECK (
  tenant_id = public.get_user_tenant_id()
  AND (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'super_admin'::public.app_role))
);

CREATE POLICY "Admins can update ppa settlements"
ON public.ppa_settlements FOR UPDATE TO authenticated
USING (
  tenant_id = public.get_user_tenant_id()
  AND (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'super_admin'::public.app_role))
);

CREATE POLICY "Admins can delete ppa settlements"
ON public.ppa_settlements FOR DELETE TO authenticated
USING (
  tenant_id = public.get_user_tenant_id()
  AND (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'super_admin'::public.app_role))
);

CREATE TRIGGER trg_ppa_settlements_updated_at
BEFORE UPDATE ON public.ppa_settlements
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
