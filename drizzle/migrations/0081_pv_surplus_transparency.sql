ALTER TABLE public.solar_charging_config ADD COLUMN IF NOT EXISTS storage_coupled boolean;
COMMENT ON COLUMN public.solar_charging_config.storage_coupled IS 'NULL = automatisch (ELMI-Vorlage = gekoppelt); true = Speicher gehört zur Ladestation und darf beim Laden immer entladen';
ALTER TABLE public.solar_charging_log ADD COLUMN IF NOT EXISTS config_id uuid;
ALTER TABLE public.solar_charging_log ADD COLUMN IF NOT EXISTS charge_point_id uuid;
ALTER TABLE public.solar_charging_log ADD COLUMN IF NOT EXISTS decision jsonb;
CREATE INDEX IF NOT EXISTS solar_charging_log_config_time_idx ON public.solar_charging_log (config_id, executed_at DESC);
CREATE INDEX IF NOT EXISTS solar_charging_log_executed_at_idx ON public.solar_charging_log (executed_at);

CREATE OR REPLACE FUNCTION public.cleanup_solar_charging_log()
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  DELETE FROM public.solar_charging_log WHERE executed_at < now() - interval '30 days';
$$;
REVOKE ALL ON FUNCTION public.cleanup_solar_charging_log() FROM PUBLIC, anon, authenticated;

DO $$
DECLARE j bigint;
BEGIN
  IF to_regclass('cron.job') IS NULL THEN RETURN; END IF;
  SELECT jobid INTO j FROM cron.job WHERE jobname = 'ems-solar-charging-scheduler';
  IF j IS NOT NULL THEN
    PERFORM cron.alter_job(j, schedule := '*/3 * * * *');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'cleanup-solar-charging-log') THEN
    PERFORM cron.schedule('cleanup-solar-charging-log', '17 3 * * *', 'SELECT public.cleanup_solar_charging_log();');
  END IF;
END $$;