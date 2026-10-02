
-- IO-Optimierung: Maßnahme 6 + 8

-- (6) Doppelte Loxone-Cron-Jobs entzerren:
-- "loxone-power-readings-sync" lief jede Minute und rief loxone-periodic-sync auf,
-- "ems-loxone-periodic-sync" macht denselben Aufruf alle 2 Minuten.
-- Wir entfernen den Minuten-Job; die 2-Min-Variante bleibt aktiv.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'loxone-power-readings-sync') THEN
    PERFORM cron.unschedule('loxone-power-readings-sync');
  END IF;
END$$;

-- (8) OCPP-Message-Log Retention von 30 auf 7 Tage verkürzen.
CREATE OR REPLACE FUNCTION public.cleanup_old_ocpp_logs()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_deleted integer;
BEGIN
  DELETE FROM public.ocpp_message_log
   WHERE created_at < now() - interval '7 days';
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$function$;
