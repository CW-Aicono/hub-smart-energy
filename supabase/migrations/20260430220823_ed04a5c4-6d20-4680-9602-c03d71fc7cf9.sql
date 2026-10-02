-- Energiemanagement & Zugangssteuerung — Schema-Erweiterungen

-- 1) Audit-Log für Authorize-/StartTransaction-Versuche
CREATE TABLE IF NOT EXISTS public.charging_access_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  charge_point_id uuid REFERENCES public.charge_points(id) ON DELETE CASCADE,
  charge_point_ocpp_id text,
  id_tag text,
  result text NOT NULL CHECK (result IN ('Accepted','Blocked','Invalid','Expired','ConcurrentTx')),
  reason text,
  metadata jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_charging_access_log_cp ON public.charging_access_log(charge_point_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_charging_access_log_tenant ON public.charging_access_log(tenant_id, created_at DESC);

ALTER TABLE public.charging_access_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant users see own access logs"
  ON public.charging_access_log FOR SELECT
  USING (tenant_id = public.get_user_tenant_id() OR public.has_role(auth.uid(), 'super_admin'::public.app_role));

CREATE POLICY "Service role inserts access logs"
  ON public.charging_access_log FOR INSERT
  WITH CHECK (true);

-- 2) Standort-Hardlimit für DLM
ALTER TABLE public.locations
  ADD COLUMN IF NOT EXISTS grid_limit_kw numeric;

COMMENT ON COLUMN public.locations.grid_limit_kw IS
  'Maximale Bezugsleistung am Hausanschluss in kW (für Dynamisches Lastmanagement). NULL = kein Limit.';

-- 3) Aktuell gesetztes OCPP-ChargingProfile pro Connector (für Idempotenz im Scheduler)
CREATE TABLE IF NOT EXISTS public.charge_point_active_profile (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  charge_point_id uuid NOT NULL REFERENCES public.charge_points(id) ON DELETE CASCADE,
  connector_id integer NOT NULL DEFAULT 0,
  profile_purpose text NOT NULL DEFAULT 'TxDefaultProfile',
  source text NOT NULL CHECK (source IN ('power_limit','dlm','pv_surplus','cheap_charging','manual')),
  current_limit_a numeric,
  current_limit_w numeric,
  applied_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz,
  metadata jsonb,
  UNIQUE (charge_point_id, connector_id, profile_purpose)
);

ALTER TABLE public.charge_point_active_profile ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant users read active profiles"
  ON public.charge_point_active_profile FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.charge_points cp
      WHERE cp.id = charge_point_active_profile.charge_point_id
        AND (cp.tenant_id = public.get_user_tenant_id() OR public.has_role(auth.uid(), 'super_admin'::public.app_role))
    )
  );

CREATE POLICY "Service role manages active profiles"
  ON public.charge_point_active_profile FOR ALL
  USING (true) WITH CHECK (true);

-- 4) Profile-Capability-Flag pro Wallbox (für SetChargingProfile-Fallback-Logik)
ALTER TABLE public.charge_points
  ADD COLUMN IF NOT EXISTS supports_charging_profile boolean,
  ADD COLUMN IF NOT EXISTS supports_change_configuration boolean DEFAULT true;

COMMENT ON COLUMN public.charge_points.supports_charging_profile IS
  'NULL=unbekannt (probieren), true=funktioniert, false=NotSupported (Fallback ChangeConfiguration nutzen)';

-- 5) Cheap-Charging-Fenster pro Gruppe und CP (in energy_settings als JSON)
--    Schema-Ergänzung in vorhandenem JSONB ist nicht-strict, daher nur Default backfillen
UPDATE public.charge_point_groups
  SET energy_settings = energy_settings || jsonb_build_object(
    'cheap_charging_window', jsonb_build_object('time_from','22:00','time_to','06:00')
  )
  WHERE NOT (energy_settings ? 'cheap_charging_window');

-- 6) trigger fürs updated_at am charge_point_active_profile (kein updated_at vorhanden, deshalb nicht nötig)

-- 7) RLS für locations.grid_limit_kw nutzt bestehende Policies → keine Änderung