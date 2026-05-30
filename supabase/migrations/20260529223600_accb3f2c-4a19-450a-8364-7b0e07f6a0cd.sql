
ALTER TABLE public.ppa_onsite_config
  ADD COLUMN IF NOT EXISTS surplus_community_id uuid REFERENCES public.energy_communities(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_ppa_onsite_surplus_community ON public.ppa_onsite_config(surplus_community_id);

CREATE TABLE public.ppa_goo_certificates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  contract_id uuid NOT NULL REFERENCES public.ppa_contracts(id) ON DELETE CASCADE,
  certificate_number text NOT NULL,
  registry text NOT NULL DEFAULT 'HKNR',
  energy_source text NOT NULL DEFAULT 'solar',
  generation_period_start date NOT NULL,
  generation_period_end date NOT NULL,
  volume_kwh numeric(14,3) NOT NULL,
  status text NOT NULL DEFAULT 'issued',
  counterparty text,
  issued_at timestamptz,
  transferred_at timestamptz,
  redeemed_at timestamptz,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ppa_goo_cert_number_unique UNIQUE (tenant_id, certificate_number),
  CONSTRAINT ppa_goo_status_check CHECK (status IN ('issued','transferred','redeemed','cancelled'))
);

CREATE INDEX idx_ppa_goo_contract ON public.ppa_goo_certificates(contract_id, generation_period_start DESC);
CREATE INDEX idx_ppa_goo_tenant ON public.ppa_goo_certificates(tenant_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.ppa_goo_certificates TO authenticated;
GRANT ALL ON public.ppa_goo_certificates TO service_role;

ALTER TABLE public.ppa_goo_certificates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant can view goo certs"
ON public.ppa_goo_certificates FOR SELECT TO authenticated
USING (tenant_id = public.get_user_tenant_id() OR public.has_role(auth.uid(), 'super_admin'::public.app_role));

CREATE POLICY "Admins can insert goo certs"
ON public.ppa_goo_certificates FOR INSERT TO authenticated
WITH CHECK (tenant_id = public.get_user_tenant_id() AND (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'super_admin'::public.app_role)));

CREATE POLICY "Admins can update goo certs"
ON public.ppa_goo_certificates FOR UPDATE TO authenticated
USING (tenant_id = public.get_user_tenant_id() AND (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'super_admin'::public.app_role)));

CREATE POLICY "Admins can delete goo certs"
ON public.ppa_goo_certificates FOR DELETE TO authenticated
USING (tenant_id = public.get_user_tenant_id() AND (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'super_admin'::public.app_role)));

CREATE TRIGGER trg_ppa_goo_updated_at
BEFORE UPDATE ON public.ppa_goo_certificates
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
