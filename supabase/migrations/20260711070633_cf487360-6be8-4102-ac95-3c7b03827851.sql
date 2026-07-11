DO $$ BEGIN CREATE TYPE public.savings_contract_status AS ENUM ('draft','active','paused','terminated');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE public.savings_baseline_source AS ENUM ('auto_from_meters','manual_override','invoice_based');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE public.savings_settlement_status AS ENUM ('draft','approved','invoiced','paid','void');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE public.savings_price_basis AS ENUM ('current_year_avg','contract_fixed');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.tenant_savings_contracts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  status public.savings_contract_status NOT NULL DEFAULT 'draft',
  baseline_year INT NOT NULL,
  start_year INT NOT NULL,
  aicono_share_pct NUMERIC(5,2) NOT NULL DEFAULT 0 CHECK (aicono_share_pct >= 0 AND aicono_share_pct <= 100),
  partner_share_pct_of_aicono NUMERIC(5,2) NOT NULL DEFAULT 0 CHECK (partner_share_pct_of_aicono >= 0 AND partner_share_pct_of_aicono <= 100),
  weather_normalize BOOLEAN NOT NULL DEFAULT true,
  price_basis public.savings_price_basis NOT NULL DEFAULT 'current_year_avg',
  fixed_price_eur_per_kwh JSONB NOT NULL DEFAULT '{}'::jsonb,
  notes TEXT,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS uniq_tenant_savings_contracts_active
  ON public.tenant_savings_contracts (tenant_id) WHERE status = 'active';
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tenant_savings_contracts TO authenticated;
GRANT ALL ON public.tenant_savings_contracts TO service_role;
ALTER TABLE public.tenant_savings_contracts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "super_admin manage savings contracts"
  ON public.tenant_savings_contracts FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'super_admin'))
  WITH CHECK (public.has_role(auth.uid(),'super_admin'));

CREATE POLICY "tenant admin reads own savings contract"
  ON public.tenant_savings_contracts FOR SELECT TO authenticated
  USING (tenant_id = public.get_user_tenant_id() AND public.has_role(auth.uid(),'admin'));

CREATE POLICY "partner reads assigned tenant contracts"
  ON public.tenant_savings_contracts FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.tenants t
    JOIN public.partner_members pm ON pm.partner_id = t.partner_id
    WHERE t.id = tenant_savings_contracts.tenant_id AND pm.user_id = auth.uid()
  ));

CREATE TABLE IF NOT EXISTS public.tenant_savings_baselines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id UUID NOT NULL REFERENCES public.tenant_savings_contracts(id) ON DELETE CASCADE,
  energy_type TEXT NOT NULL,
  baseline_kwh_raw NUMERIC(18,3) NOT NULL DEFAULT 0,
  baseline_hdd NUMERIC(12,3),
  baseline_kwh_normalized NUMERIC(18,3) NOT NULL DEFAULT 0,
  baseline_source public.savings_baseline_source NOT NULL DEFAULT 'auto_from_meters',
  override_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (contract_id, energy_type)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tenant_savings_baselines TO authenticated;
GRANT ALL ON public.tenant_savings_baselines TO service_role;
ALTER TABLE public.tenant_savings_baselines ENABLE ROW LEVEL SECURITY;

CREATE POLICY "super_admin manage savings baselines"
  ON public.tenant_savings_baselines FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'super_admin'))
  WITH CHECK (public.has_role(auth.uid(),'super_admin'));

CREATE POLICY "tenant admin reads own savings baselines"
  ON public.tenant_savings_baselines FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.tenant_savings_contracts c
    WHERE c.id = tenant_savings_baselines.contract_id
      AND c.tenant_id = public.get_user_tenant_id()
      AND public.has_role(auth.uid(),'admin')
  ));

CREATE POLICY "partner reads assigned tenant baselines"
  ON public.tenant_savings_baselines FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.tenant_savings_contracts c
    JOIN public.tenants t ON t.id = c.tenant_id
    JOIN public.partner_members pm ON pm.partner_id = t.partner_id
    WHERE c.id = tenant_savings_baselines.contract_id AND pm.user_id = auth.uid()
  ));

CREATE TABLE IF NOT EXISTS public.tenant_savings_settlements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id UUID NOT NULL REFERENCES public.tenant_savings_contracts(id) ON DELETE CASCADE,
  period_year INT NOT NULL,
  status public.savings_settlement_status NOT NULL DEFAULT 'draft',
  per_energy_type JSONB NOT NULL DEFAULT '[]'::jsonb,
  total_savings_eur NUMERIC(14,2) NOT NULL DEFAULT 0,
  aicono_amount_eur NUMERIC(14,2) NOT NULL DEFAULT 0,
  partner_amount_eur NUMERIC(14,2) NOT NULL DEFAULT 0,
  tenant_retained_eur NUMERIC(14,2) NOT NULL DEFAULT 0,
  approved_by UUID,
  approved_at TIMESTAMPTZ,
  invoice_ref TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (contract_id, period_year)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tenant_savings_settlements TO authenticated;
GRANT ALL ON public.tenant_savings_settlements TO service_role;
ALTER TABLE public.tenant_savings_settlements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "super_admin manage savings settlements"
  ON public.tenant_savings_settlements FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'super_admin'))
  WITH CHECK (public.has_role(auth.uid(),'super_admin'));

CREATE POLICY "tenant admin reads own approved settlements"
  ON public.tenant_savings_settlements FOR SELECT TO authenticated
  USING (
    status <> 'draft' AND EXISTS (
      SELECT 1 FROM public.tenant_savings_contracts c
      WHERE c.id = tenant_savings_settlements.contract_id
        AND c.tenant_id = public.get_user_tenant_id()
        AND public.has_role(auth.uid(),'admin')
    )
  );

CREATE POLICY "partner reads approved settlements of assigned tenants"
  ON public.tenant_savings_settlements FOR SELECT TO authenticated
  USING (
    status IN ('approved','invoiced','paid') AND EXISTS (
      SELECT 1 FROM public.tenant_savings_contracts c
      JOIN public.tenants t ON t.id = c.tenant_id
      JOIN public.partner_members pm ON pm.partner_id = t.partner_id
      WHERE c.id = tenant_savings_settlements.contract_id AND pm.user_id = auth.uid()
    )
  );

CREATE TRIGGER trg_tenant_savings_contracts_updated_at
  BEFORE UPDATE ON public.tenant_savings_contracts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_tenant_savings_baselines_updated_at
  BEFORE UPDATE ON public.tenant_savings_baselines
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_tenant_savings_settlements_updated_at
  BEFORE UPDATE ON public.tenant_savings_settlements
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();