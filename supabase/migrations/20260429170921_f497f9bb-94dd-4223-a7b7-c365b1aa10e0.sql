-- Tabelle für 5-Minuten-Online-Snapshots pro Ladepunkt
CREATE TABLE IF NOT EXISTS public.charge_point_uptime_snapshots (
  id BIGSERIAL PRIMARY KEY,
  charge_point_id UUID NOT NULL REFERENCES public.charge_points(id) ON DELETE CASCADE,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  is_online BOOLEAN NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_cp_uptime_snapshots_cp_time
  ON public.charge_point_uptime_snapshots (charge_point_id, recorded_at DESC);

-- RLS
ALTER TABLE public.charge_point_uptime_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant users can view their charge point uptime snapshots"
  ON public.charge_point_uptime_snapshots
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.charge_points cp
      WHERE cp.id = charge_point_uptime_snapshots.charge_point_id
        AND cp.tenant_id = public.get_user_tenant_id()
    )
    OR public.has_role(auth.uid(), 'super_admin'::app_role)
  );

-- Snapshot-Funktion: schreibt pro Ladepunkt einen Eintrag, sobald
-- mindestens ein Heartbeat oder ws_connected_since existiert (= "war schon mal verbunden").
-- Online = ws_connected = true ODER last_heartbeat juenger als 5 Minuten.
CREATE OR REPLACE FUNCTION public.snapshot_charge_point_uptime()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_inserted integer;
BEGIN
  INSERT INTO public.charge_point_uptime_snapshots (charge_point_id, is_online)
  SELECT
    cp.id,
    COALESCE(cp.ws_connected, false)
      OR (cp.last_heartbeat IS NOT NULL AND cp.last_heartbeat > now() - interval '5 minutes')
  FROM public.charge_points cp
  WHERE cp.last_heartbeat IS NOT NULL OR cp.ws_connected_since IS NOT NULL;

  GET DIAGNOSTICS v_inserted = ROW_COUNT;
  RETURN v_inserted;
END;
$function$;

-- Aufraeum-Funktion: behaelt nur die letzten 35 Tage
CREATE OR REPLACE FUNCTION public.cleanup_charge_point_uptime_snapshots()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_deleted integer;
BEGIN
  DELETE FROM public.charge_point_uptime_snapshots
  WHERE recorded_at < now() - interval '35 days';
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$function$;

-- Berechnung der 30-Tage-Stabilitaet pro Ladepunkt.
-- Liefert NULL wenn noch nie ein Snapshot existiert (= noch nie verbunden).
CREATE OR REPLACE FUNCTION public.get_charge_point_uptime_pct(p_charge_point_id uuid, p_days integer DEFAULT 30)
RETURNS numeric
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_total integer;
  v_online integer;
BEGIN
  SELECT COUNT(*), COUNT(*) FILTER (WHERE is_online)
  INTO v_total, v_online
  FROM public.charge_point_uptime_snapshots
  WHERE charge_point_id = p_charge_point_id
    AND recorded_at >= now() - make_interval(days => p_days);

  IF v_total = 0 THEN
    RETURN NULL;
  END IF;

  RETURN ROUND((v_online::numeric * 100.0) / v_total::numeric, 2);
END;
$function$;

-- pg_cron: alle 5 Minuten Snapshot, taeglich um 03:30 Uhr aufraeumen
SELECT cron.schedule(
  'snapshot-charge-point-uptime',
  '*/5 * * * *',
  $$SELECT public.snapshot_charge_point_uptime();$$
);

SELECT cron.schedule(
  'cleanup-charge-point-uptime',
  '30 3 * * *',
  $$SELECT public.cleanup_charge_point_uptime_snapshots();$$
);

-- Sofort einen ersten Snapshot schreiben (sonst muesste man 5 Min warten)
SELECT public.snapshot_charge_point_uptime();