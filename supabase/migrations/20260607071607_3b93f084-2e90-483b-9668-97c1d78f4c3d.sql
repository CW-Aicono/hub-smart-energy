
-- ==============================================
-- K1: Eichrecht & OCMF Transparency Export
-- ==============================================

-- 1) Charge Points: Eichrecht-Konfiguration
ALTER TABLE public.charge_points
  ADD COLUMN IF NOT EXISTS eichrecht_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS meter_public_key TEXT,
  ADD COLUMN IF NOT EXISTS meter_format TEXT NOT NULL DEFAULT 'NONE'
    CHECK (meter_format IN ('OCMF', 'ALFEN', 'NONE'));

-- 2) Charging Sessions: finaler OCMF-Beleg
ALTER TABLE public.charging_sessions
  ADD COLUMN IF NOT EXISTS ocmf_payload TEXT,
  ADD COLUMN IF NOT EXISTS ocmf_status TEXT
    CHECK (ocmf_status IN ('signed', 'unsigned', 'invalid', 'pending')),
  ADD COLUMN IF NOT EXISTS ocmf_public_key_fingerprint TEXT,
  ADD COLUMN IF NOT EXISTS ocmf_finalized_at TIMESTAMPTZ;

-- 3) Meter-Records pro Session (alle eingehenden signierten MeterValues)
CREATE TABLE IF NOT EXISTS public.charging_session_meter_records (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  session_id UUID NOT NULL REFERENCES public.charging_sessions(id) ON DELETE CASCADE,
  charge_point_id UUID REFERENCES public.charge_points(id) ON DELETE SET NULL,
  sampled_at TIMESTAMPTZ NOT NULL,
  context TEXT NOT NULL DEFAULT 'Sample.Periodic',
  meter_format TEXT NOT NULL DEFAULT 'OCMF',
  raw_payload TEXT NOT NULL,
  signed_value TEXT,
  reading_wh NUMERIC,
  public_key_fingerprint TEXT,
  verification_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (verification_status IN ('signed', 'unsigned', 'invalid', 'pending')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_csmr_session ON public.charging_session_meter_records(session_id, sampled_at);
CREATE INDEX IF NOT EXISTS idx_csmr_tenant ON public.charging_session_meter_records(tenant_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.charging_session_meter_records TO authenticated;
GRANT ALL ON public.charging_session_meter_records TO service_role;

ALTER TABLE public.charging_session_meter_records ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant users can view their meter records"
  ON public.charging_session_meter_records FOR SELECT
  TO authenticated
  USING (tenant_id = public.get_user_tenant_id());

CREATE POLICY "Tenant admins manage meter records"
  ON public.charging_session_meter_records FOR ALL
  TO authenticated
  USING (tenant_id = public.get_user_tenant_id() AND public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (tenant_id = public.get_user_tenant_id() AND public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Super admins full access meter records"
  ON public.charging_session_meter_records FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'::app_role));

CREATE POLICY "Charging users view own meter records"
  ON public.charging_session_meter_records FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.charging_sessions cs
      JOIN public.charging_users cu ON cu.auth_user_id = auth.uid()
      WHERE cs.id = charging_session_meter_records.session_id
        AND cu.status = 'active'
        AND (
          (cu.rfid_tag IS NOT NULL AND cu.rfid_tag = cs.id_tag) OR
          (cu.app_tag IS NOT NULL AND cs.id_tag LIKE 'APP%' AND cu.app_tag = cs.id_tag) OR
          EXISTS (
            SELECT 1 FROM public.charging_user_rfid_tags t
            WHERE t.user_id = cu.id AND upper(t.tag) = upper(cs.id_tag)
          )
        )
    )
  );
