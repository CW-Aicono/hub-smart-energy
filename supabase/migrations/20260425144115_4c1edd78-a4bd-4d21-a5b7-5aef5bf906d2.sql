-- Gateway Sensor Snapshot Cache + Refresh Lock
-- Speichert die zuletzt erfolgreich gelesene Sensorliste pro Standort-Integration,
-- damit die UI nicht bei jedem Render eine schwere Edge Function gegen den
-- externen Gateway/Miniserver auslösen muss.

CREATE TABLE IF NOT EXISTS public.gateway_sensor_snapshots (
  location_integration_id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL,
  location_id uuid,
  sensors jsonb NOT NULL DEFAULT '[]'::jsonb,
  system_messages jsonb NOT NULL DEFAULT '[]'::jsonb,
  status text NOT NULL DEFAULT 'fresh',
  fetched_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz,
  error_message text,
  source text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS gateway_sensor_snapshots_tenant_idx
  ON public.gateway_sensor_snapshots (tenant_id);
CREATE INDEX IF NOT EXISTS gateway_sensor_snapshots_location_idx
  ON public.gateway_sensor_snapshots (location_id);

ALTER TABLE public.gateway_sensor_snapshots ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Tenant users can read own snapshots"
  ON public.gateway_sensor_snapshots;
CREATE POLICY "Tenant users can read own snapshots"
  ON public.gateway_sensor_snapshots
  FOR SELECT
  TO authenticated
  USING (tenant_id = public.get_user_tenant_id());

-- Schreibzugriff bleibt absichtlich nur dem Service Role vorbehalten
-- (Edge Functions verwenden den Service-Role-Key). Es werden bewusst KEINE
-- INSERT/UPDATE/DELETE-Policies für authentifizierte Nutzer angelegt.

DROP TRIGGER IF EXISTS gateway_sensor_snapshots_set_updated_at
  ON public.gateway_sensor_snapshots;
CREATE TRIGGER gateway_sensor_snapshots_set_updated_at
  BEFORE UPDATE ON public.gateway_sensor_snapshots
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ── Refresh-Lock-Tabelle ──
-- Verhindert, dass mehrere Edge-Function-Instanzen für dieselbe Integration
-- gleichzeitig gegen den externen Gateway abrufen.
CREATE TABLE IF NOT EXISTS public.gateway_refresh_locks (
  location_integration_id uuid PRIMARY KEY,
  locked_at timestamptz NOT NULL DEFAULT now(),
  locked_by text
);

ALTER TABLE public.gateway_refresh_locks ENABLE ROW LEVEL SECURITY;
-- keine Policies → nur Service-Role-Zugriff

-- Atomic try-acquire: gibt true zurück, wenn der Lock frisch ist (jünger als
-- p_ttl_seconds) und vom aktuellen Aufrufer beansprucht werden konnte.
CREATE OR REPLACE FUNCTION public.try_acquire_gateway_refresh_lock(
  p_integration_id uuid,
  p_owner text,
  p_ttl_seconds integer DEFAULT 60
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_now timestamptz := now();
  v_cutoff timestamptz := v_now - make_interval(secs => p_ttl_seconds);
  v_inserted integer;
BEGIN
  INSERT INTO public.gateway_refresh_locks (location_integration_id, locked_at, locked_by)
  VALUES (p_integration_id, v_now, p_owner)
  ON CONFLICT (location_integration_id) DO UPDATE
    SET locked_at = EXCLUDED.locked_at,
        locked_by = EXCLUDED.locked_by
    WHERE public.gateway_refresh_locks.locked_at < v_cutoff;

  GET DIAGNOSTICS v_inserted = ROW_COUNT;
  RETURN v_inserted > 0;
END;
$$;

CREATE OR REPLACE FUNCTION public.release_gateway_refresh_lock(
  p_integration_id uuid,
  p_owner text
)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  DELETE FROM public.gateway_refresh_locks
  WHERE location_integration_id = p_integration_id
    AND locked_by = p_owner;
$$;