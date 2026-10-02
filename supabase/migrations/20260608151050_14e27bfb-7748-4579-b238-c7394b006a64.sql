
-- 1) energy_storages → Gateway-Gerät verknüpfen (optional)
ALTER TABLE public.energy_storages
  ADD COLUMN IF NOT EXISTS gateway_device_id UUID REFERENCES public.gateway_devices(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS current_soc_pct NUMERIC;

-- 2) peak_shaving_configs → Report-Empfänger
ALTER TABLE public.peak_shaving_configs
  ADD COLUMN IF NOT EXISTS report_recipients TEXT[] NOT NULL DEFAULT '{}'::text[],
  ADD COLUMN IF NOT EXISTS report_enabled BOOLEAN NOT NULL DEFAULT false;

-- 3) Event-Kalender
CREATE TABLE public.peak_shaving_event_calendar (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  config_id UUID NOT NULL REFERENCES public.peak_shaving_configs(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  event_name TEXT NOT NULL,
  start_at TIMESTAMPTZ NOT NULL,
  end_at TIMESTAMPTZ NOT NULL,
  expected_peak_kw NUMERIC,
  pre_charge_target_soc_pct NUMERIC NOT NULL DEFAULT 95 CHECK (pre_charge_target_soc_pct > 0 AND pre_charge_target_soc_pct <= 100),
  pre_charge_lead_hours NUMERIC NOT NULL DEFAULT 4 CHECK (pre_charge_lead_hours > 0 AND pre_charge_lead_hours <= 48),
  pre_charge_started_at TIMESTAMPTZ,
  pre_charge_completed_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'planned' CHECK (status IN ('planned','pre_charging','active','completed','cancelled')),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (end_at > start_at)
);
CREATE INDEX idx_psec_config_time ON public.peak_shaving_event_calendar(config_id, start_at);
CREATE INDEX idx_psec_tenant_time ON public.peak_shaving_event_calendar(tenant_id, start_at DESC);
CREATE INDEX idx_psec_upcoming ON public.peak_shaving_event_calendar(start_at) WHERE status IN ('planned','pre_charging');

GRANT SELECT, INSERT, UPDATE, DELETE ON public.peak_shaving_event_calendar TO authenticated;
GRANT ALL ON public.peak_shaving_event_calendar TO service_role;

ALTER TABLE public.peak_shaving_event_calendar ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant users view own psec"
  ON public.peak_shaving_event_calendar FOR SELECT TO authenticated
  USING (
    has_role(auth.uid(),'super_admin'::app_role)
    OR tenant_id IN (SELECT tenant_id FROM public.profiles WHERE id = auth.uid())
  );

CREATE POLICY "Tenant users manage own psec"
  ON public.peak_shaving_event_calendar FOR ALL TO authenticated
  USING (
    has_role(auth.uid(),'super_admin'::app_role)
    OR tenant_id IN (SELECT tenant_id FROM public.profiles WHERE id = auth.uid())
  )
  WITH CHECK (
    has_role(auth.uid(),'super_admin'::app_role)
    OR tenant_id IN (SELECT tenant_id FROM public.profiles WHERE id = auth.uid())
  );

CREATE TRIGGER update_psec_updated_at
  BEFORE UPDATE ON public.peak_shaving_event_calendar
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 4) Dispatch-Log
CREATE TABLE public.peak_shaving_dispatch_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  config_id UUID NOT NULL REFERENCES public.peak_shaving_configs(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  storage_id UUID NOT NULL REFERENCES public.energy_storages(id) ON DELETE CASCADE,
  gateway_command_id UUID REFERENCES public.gateway_commands(id) ON DELETE SET NULL,
  event_id UUID REFERENCES public.peak_shaving_events(id) ON DELETE SET NULL,
  calendar_id UUID REFERENCES public.peak_shaving_event_calendar(id) ON DELETE SET NULL,
  action TEXT NOT NULL CHECK (action IN ('discharge','charge','release')),
  target_power_kw NUMERIC NOT NULL,
  reason TEXT,
  success BOOLEAN,
  error_message TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_psdl_config ON public.peak_shaving_dispatch_log(config_id, created_at DESC);
CREATE INDEX idx_psdl_tenant ON public.peak_shaving_dispatch_log(tenant_id, created_at DESC);

GRANT SELECT ON public.peak_shaving_dispatch_log TO authenticated;
GRANT ALL ON public.peak_shaving_dispatch_log TO service_role;

ALTER TABLE public.peak_shaving_dispatch_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant users view own psdl"
  ON public.peak_shaving_dispatch_log FOR SELECT TO authenticated
  USING (
    has_role(auth.uid(),'super_admin'::app_role)
    OR tenant_id IN (SELECT tenant_id FROM public.profiles WHERE id = auth.uid())
  );
