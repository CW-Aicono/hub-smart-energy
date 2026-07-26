
-- 1. Session-Log-Tabelle für AICONO Gateways
CREATE TABLE public.gateway_ws_session_log (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID,
  gateway_device_id UUID NOT NULL REFERENCES public.gateway_devices(id) ON DELETE CASCADE,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ended_at TIMESTAMPTZ,
  events_received INTEGER NOT NULL DEFAULT 0,
  reconnect_count INTEGER NOT NULL DEFAULT 0,
  seamless_recycle_count INTEGER NOT NULL DEFAULT 0,
  disconnect_reason TEXT,
  disconnect_code INTEGER,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT ON public.gateway_ws_session_log TO authenticated;
GRANT ALL ON public.gateway_ws_session_log TO service_role;

ALTER TABLE public.gateway_ws_session_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admin can read all gateway ws sessions"
  ON public.gateway_ws_session_log
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'));

CREATE POLICY "Service role manages gateway ws sessions"
  ON public.gateway_ws_session_log
  FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);

CREATE INDEX gateway_ws_session_log_device_started_idx
  ON public.gateway_ws_session_log (gateway_device_id, started_at DESC);

CREATE INDEX gateway_ws_session_log_open_idx
  ON public.gateway_ws_session_log (gateway_device_id, started_at DESC)
  WHERE ended_at IS NULL;

-- 2. Aggregations-RPC für die Flotten-Übersicht (24 h)
CREATE OR REPLACE FUNCTION public.aicono_fleet_stats_24h()
RETURNS TABLE (
  gateway_device_id UUID,
  events_24h BIGINT,
  reconnects_24h BIGINT,
  sessions_24h BIGINT,
  seamless_recycles_24h BIGINT,
  last_disconnect_at TIMESTAMPTZ,
  last_disconnect_reason TEXT,
  last_disconnect_code INTEGER
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH win AS (
    SELECT * FROM public.gateway_ws_session_log
    WHERE started_at >= now() - interval '24 hours'
       OR (ended_at IS NULL AND started_at >= now() - interval '48 hours')
  ),
  agg AS (
    SELECT
      gateway_device_id,
      COALESCE(SUM(events_received), 0)::BIGINT       AS events_24h,
      COALESCE(SUM(reconnect_count), 0)::BIGINT       AS reconnects_24h,
      COUNT(*)::BIGINT                                AS sessions_24h,
      COALESCE(SUM(seamless_recycle_count), 0)::BIGINT AS seamless_recycles_24h
    FROM win
    GROUP BY gateway_device_id
  ),
  last_dc AS (
    SELECT DISTINCT ON (gateway_device_id)
      gateway_device_id,
      ended_at        AS last_disconnect_at,
      disconnect_reason AS last_disconnect_reason,
      disconnect_code AS last_disconnect_code
    FROM public.gateway_ws_session_log
    WHERE ended_at IS NOT NULL
      AND ended_at >= now() - interval '24 hours'
    ORDER BY gateway_device_id, ended_at DESC
  )
  SELECT
    a.gateway_device_id,
    a.events_24h,
    a.reconnects_24h,
    a.sessions_24h,
    a.seamless_recycles_24h,
    d.last_disconnect_at,
    d.last_disconnect_reason,
    d.last_disconnect_code
  FROM agg a
  LEFT JOIN last_dc d USING (gateway_device_id);
$$;

REVOKE ALL ON FUNCTION public.aicono_fleet_stats_24h() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.aicono_fleet_stats_24h() TO authenticated;

-- 3. Retention-Job (7 Tage) via pg_cron
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule('cleanup-gateway-ws-session-log')
      WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'cleanup-gateway-ws-session-log');
    PERFORM cron.schedule(
      'cleanup-gateway-ws-session-log',
      '17 3 * * *',
      $sql$ DELETE FROM public.gateway_ws_session_log
            WHERE ended_at IS NOT NULL AND ended_at < now() - interval '7 days'; $sql$
    );
  END IF;
END $$;

-- Trigger, um verwaiste offene Sessions nach 30 min automatisch zu schließen
-- (Recycled Isolate, das nie `tearDown` mit ended_at ausführen konnte).
CREATE OR REPLACE FUNCTION public.close_orphan_gateway_ws_sessions()
RETURNS INTEGER
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  WITH updated AS (
    UPDATE public.gateway_ws_session_log
    SET ended_at = COALESCE(ended_at, now()),
        disconnect_reason = COALESCE(disconnect_reason, 'auto_close_stale'),
        updated_at = now()
    WHERE ended_at IS NULL
      AND started_at < now() - interval '30 minutes'
    RETURNING 1
  )
  SELECT COUNT(*)::INTEGER FROM updated;
$$;

REVOKE ALL ON FUNCTION public.close_orphan_gateway_ws_sessions() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.close_orphan_gateway_ws_sessions() TO service_role;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule('close-orphan-gateway-ws-sessions')
      WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'close-orphan-gateway-ws-sessions');
    PERFORM cron.schedule(
      'close-orphan-gateway-ws-sessions',
      '*/15 * * * *',
      $sql$ SELECT public.close_orphan_gateway_ws_sessions(); $sql$
    );
  END IF;
END $$;
