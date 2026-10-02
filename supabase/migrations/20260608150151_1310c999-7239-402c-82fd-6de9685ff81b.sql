
-- =========================================================
-- 1) peak_shaving_configs
-- =========================================================
CREATE TABLE public.peak_shaving_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  location_id UUID NOT NULL REFERENCES public.locations(id) ON DELETE CASCADE,
  storage_id UUID NOT NULL REFERENCES public.energy_storages(id) ON DELETE CASCADE,
  peak_limit_kw NUMERIC NOT NULL CHECK (peak_limit_kw > 0),
  reserve_soc_pct NUMERIC NOT NULL DEFAULT 20 CHECK (reserve_soc_pct >= 0 AND reserve_soc_pct <= 100),
  mode TEXT NOT NULL DEFAULT 'threshold' CHECK (mode IN ('threshold','forecast','event')),
  network_tariff_eur_per_kw_year NUMERIC NOT NULL DEFAULT 150,
  billing_cycle TEXT NOT NULL DEFAULT 'monthly' CHECK (billing_cycle IN ('monthly','yearly')),
  hysteresis_pct NUMERIC NOT NULL DEFAULT 85 CHECK (hysteresis_pct > 0 AND hysteresis_pct < 100),
  active BOOLEAN NOT NULL DEFAULT true,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (location_id, storage_id)
);
CREATE INDEX idx_peak_shaving_configs_tenant ON public.peak_shaving_configs(tenant_id);
CREATE INDEX idx_peak_shaving_configs_active ON public.peak_shaving_configs(active) WHERE active;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.peak_shaving_configs TO authenticated;
GRANT ALL ON public.peak_shaving_configs TO service_role;

ALTER TABLE public.peak_shaving_configs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant users view own peak_shaving_configs"
  ON public.peak_shaving_configs FOR SELECT TO authenticated
  USING (
    has_role(auth.uid(),'super_admin'::app_role)
    OR tenant_id IN (SELECT tenant_id FROM public.profiles WHERE id = auth.uid())
  );

CREATE POLICY "Tenant users manage own peak_shaving_configs"
  ON public.peak_shaving_configs FOR ALL TO authenticated
  USING (
    has_role(auth.uid(),'super_admin'::app_role)
    OR tenant_id IN (SELECT tenant_id FROM public.profiles WHERE id = auth.uid())
  )
  WITH CHECK (
    has_role(auth.uid(),'super_admin'::app_role)
    OR tenant_id IN (SELECT tenant_id FROM public.profiles WHERE id = auth.uid())
  );

CREATE TRIGGER update_peak_shaving_configs_updated_at
  BEFORE UPDATE ON public.peak_shaving_configs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =========================================================
-- 2) peak_shaving_events
-- =========================================================
CREATE TABLE public.peak_shaving_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  config_id UUID NOT NULL REFERENCES public.peak_shaving_configs(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ended_at TIMESTAMPTZ,
  peak_kw_without_shaving NUMERIC,
  peak_kw_actual NUMERIC,
  kwh_discharged NUMERIC NOT NULL DEFAULT 0,
  eur_saved NUMERIC NOT NULL DEFAULT 0,
  trigger_reason TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_peak_shaving_events_config ON public.peak_shaving_events(config_id, started_at DESC);
CREATE INDEX idx_peak_shaving_events_tenant ON public.peak_shaving_events(tenant_id, started_at DESC);
CREATE INDEX idx_peak_shaving_events_active ON public.peak_shaving_events(config_id) WHERE ended_at IS NULL;

GRANT SELECT ON public.peak_shaving_events TO authenticated;
GRANT ALL ON public.peak_shaving_events TO service_role;

ALTER TABLE public.peak_shaving_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant users view own peak_shaving_events"
  ON public.peak_shaving_events FOR SELECT TO authenticated
  USING (
    has_role(auth.uid(),'super_admin'::app_role)
    OR tenant_id IN (SELECT tenant_id FROM public.profiles WHERE id = auth.uid())
  );

-- =========================================================
-- 3) peak_shaving_monthly_summary
-- =========================================================
CREATE TABLE public.peak_shaving_monthly_summary (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  config_id UUID NOT NULL REFERENCES public.peak_shaving_configs(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  year INT NOT NULL,
  month INT NOT NULL CHECK (month >= 1 AND month <= 12),
  max_peak_kw NUMERIC NOT NULL DEFAULT 0,
  baseline_peak_kw NUMERIC NOT NULL DEFAULT 0,
  total_kwh_discharged NUMERIC NOT NULL DEFAULT 0,
  total_eur_saved NUMERIC NOT NULL DEFAULT 0,
  event_count INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (config_id, year, month)
);
CREATE INDEX idx_peak_shaving_summary_tenant ON public.peak_shaving_monthly_summary(tenant_id, year DESC, month DESC);

GRANT SELECT ON public.peak_shaving_monthly_summary TO authenticated;
GRANT ALL ON public.peak_shaving_monthly_summary TO service_role;

ALTER TABLE public.peak_shaving_monthly_summary ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant users view own peak_shaving_summary"
  ON public.peak_shaving_monthly_summary FOR SELECT TO authenticated
  USING (
    has_role(auth.uid(),'super_admin'::app_role)
    OR tenant_id IN (SELECT tenant_id FROM public.profiles WHERE id = auth.uid())
  );

CREATE TRIGGER update_peak_shaving_summary_updated_at
  BEFORE UPDATE ON public.peak_shaving_monthly_summary
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =========================================================
-- 4) Modul-Eintrag
-- =========================================================
INSERT INTO public.module_prices (module_code, price_monthly, standard_price, industry_price_monthly, industry_standard_price, partner_price_monthly, partner_industry_price_monthly)
VALUES ('peak_shaving', 49, 0, 89, 0, 39, 69)
ON CONFLICT (module_code) DO NOTHING;

-- =========================================================
-- 5) Realtime
-- =========================================================
ALTER TABLE public.peak_shaving_events REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.peak_shaving_events;
