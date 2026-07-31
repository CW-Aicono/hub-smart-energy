CREATE OR REPLACE FUNCTION public.run_ems_cron_bundle()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, pg_temp
AS $fn$
DECLARE
  v_minute integer := extract(minute FROM clock_timestamp())::integer;
BEGIN
  IF NOT pg_try_advisory_xact_lock(hashtext('aicono:ems-cron-bundle')) THEN
    RAISE NOTICE 'EMS cron bundle already running; skipping overlap';
    RETURN;
  END IF;

  BEGIN
    PERFORM private.invoke_edge_function('automation-scheduler');
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'automation-scheduler failed: %', SQLERRM;
  END;

  IF mod(v_minute, 2) = 0 THEN
    BEGIN
      PERFORM private.invoke_edge_function('gateway-periodic-sync');
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'gateway-periodic-sync failed: %', SQLERRM;
    END;
    BEGIN
      PERFORM private.invoke_edge_function('cheap-charging-scheduler');
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'cheap-charging-scheduler failed: %', SQLERRM;
    END;
  ELSE
    BEGIN
      PERFORM private.invoke_edge_function('dlm-scheduler');
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'dlm-scheduler failed: %', SQLERRM;
    END;
    BEGIN
      PERFORM private.invoke_edge_function('solar-charging-scheduler');
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'solar-charging-scheduler failed: %', SQLERRM;
    END;
  END IF;

  CASE mod(v_minute, 5)
    WHEN 0 THEN
      BEGIN
        PERFORM private.invoke_edge_function('bridge-aggregator');
      EXCEPTION WHEN OTHERS THEN
        RAISE WARNING 'bridge-aggregator failed: %', SQLERRM;
      END;
    WHEN 1 THEN
      BEGIN
        PERFORM private.invoke_edge_function('brighthub-periodic-sync');
      EXCEPTION WHEN OTHERS THEN
        RAISE WARNING 'brighthub-periodic-sync failed: %', SQLERRM;
      END;
    WHEN 2 THEN
      BEGIN
        PERFORM private.invoke_edge_function('power-limit-scheduler');
      EXCEPTION WHEN OTHERS THEN
        RAISE WARNING 'power-limit-scheduler failed: %', SQLERRM;
      END;
      BEGIN
        PERFORM private.invoke_edge_function('peak-shaving-scheduler');
      EXCEPTION WHEN OTHERS THEN
        RAISE WARNING 'peak-shaving-scheduler failed: %', SQLERRM;
      END;
    WHEN 3 THEN
      BEGIN
        PERFORM public.collect_db_metrics();
      EXCEPTION WHEN OTHERS THEN
        RAISE WARNING 'collect_db_metrics failed: %', SQLERRM;
      END;
      BEGIN
        PERFORM private.invoke_edge_function('sensor-history-aggregator');
      EXCEPTION WHEN OTHERS THEN
        RAISE WARNING 'sensor-history-aggregator failed: %', SQLERRM;
      END;
    WHEN 4 THEN
      BEGIN
        PERFORM public.evaluate_monitoring_rules();
      EXCEPTION WHEN OTHERS THEN
        RAISE WARNING 'evaluate_monitoring_rules failed: %', SQLERRM;
      END;
      BEGIN
        PERFORM public.snapshot_charge_point_uptime();
      EXCEPTION WHEN OTHERS THEN
        RAISE WARNING 'snapshot_charge_point_uptime failed: %', SQLERRM;
      END;
  END CASE;
END
$fn$;

REVOKE ALL ON FUNCTION public.run_ems_cron_bundle() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.run_ems_cron_bundle() TO service_role;

CREATE OR REPLACE FUNCTION public.run_meter_power_hourly_backfill_guarded()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_rows integer;
BEGIN
  IF NOT pg_try_advisory_xact_lock(hashtext('aicono:meter-power-hourly-backfill')) THEN
    RETURN -1;
  END IF;

  v_rows := public.backfill_meter_power_hourly(3);

  IF v_rows = 0 THEN
    PERFORM cron.unschedule('ems-backfill-power-hourly')
    WHERE EXISTS (
      SELECT 1 FROM cron.job WHERE jobname = 'ems-backfill-power-hourly'
    );
  END IF;

  RETURN v_rows;
END
$fn$;

REVOKE ALL ON FUNCTION public.run_meter_power_hourly_backfill_guarded() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.run_meter_power_hourly_backfill_guarded() TO service_role;

DO $cron$
DECLARE
  v_job text;
BEGIN
  FOREACH v_job IN ARRAY ARRAY[
    'ems-automation-scheduler',
    'ems-cheap-charging-scheduler',
    'ems-gateway-periodic-sync',
    'ems-dlm-scheduler',
    'ems-solar-charging-scheduler',
    'ems-power-limit-scheduler',
    'peak-shaving-scheduler-every-minute',
    'monitoring-collect-5min',
    'sensor-aggregator-5min',
    'monitoring-evaluate-5min',
    'snapshot-charge-point-uptime',
    'bridge-aggregator-every-5min',
    'ems-brighthub-periodic-sync'
  ] LOOP
    PERFORM cron.unschedule(v_job)
    WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = v_job);
  END LOOP;

  PERFORM cron.unschedule('ems-cron-bundle')
  WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'ems-cron-bundle');

  PERFORM cron.schedule(
    'ems-cron-bundle',
    '* * * * *',
    'SELECT public.run_ems_cron_bundle()'
  );

  PERFORM cron.unschedule('ems-backfill-power-hourly')
  WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'ems-backfill-power-hourly');

  PERFORM cron.schedule(
    'ems-backfill-power-hourly',
    '3-59/10 * * * *',
    'SELECT public.run_meter_power_hourly_backfill_guarded()'
  );
END
$cron$;