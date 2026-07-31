-- 1) Remove permanently disabled legacy jobs (superseded by ems-cron-bundle)
DO $$
DECLARE j text;
BEGIN
  FOREACH j IN ARRAY ARRAY[
    'automation-scheduler-every-2min',
    'dlm-scheduler-every-minute',
    'solar-charging-scheduler-every-2min',
    'cheap-charging-scheduler-every-5min',
    'power-limit-scheduler-every-5min',
    'gateway-power-readings-sync',
    'brighthub-intraday-sync',
    'brighthub-readings-sync',
    'fetch-spot-prices-hourly'
  ] LOOP
    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = j) THEN
      PERFORM cron.unschedule(j);
    END IF;
  END LOOP;
END $$;

-- 2) Advisory-lock wrappers for the long-running SQL maintenance jobs
CREATE OR REPLACE FUNCTION public.guarded_rollup_sensor_hourly()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT pg_try_advisory_xact_lock(hashtext('aicono:rollup_sensor_hourly')) THEN
    RAISE NOTICE 'rollup_sensor_hourly already running; skipping';
    RETURN;
  END IF;
  PERFORM public.rollup_sensor_hourly(3);
END $$;

CREATE OR REPLACE FUNCTION public.guarded_rollup_meter_power_hourly()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT pg_try_advisory_xact_lock(hashtext('aicono:rollup_meter_power_hourly')) THEN
    RAISE NOTICE 'rollup_meter_power_hourly already running; skipping';
    RETURN;
  END IF;
  PERFORM public.rollup_meter_power_hourly(6);
END $$;

CREATE OR REPLACE FUNCTION public.guarded_cleanup_bridge_raw_samples()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT pg_try_advisory_xact_lock(hashtext('aicono:cleanup_bridge_raw_samples')) THEN
    RAISE NOTICE 'cleanup_bridge_raw_samples already running; skipping';
    RETURN;
  END IF;
  PERFORM public.cleanup_bridge_raw_samples();
END $$;

CREATE OR REPLACE FUNCTION public.guarded_cleanup_sensor_readings_raw()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT pg_try_advisory_xact_lock(hashtext('aicono:cleanup_sensor_readings_raw')) THEN
    RAISE NOTICE 'cleanup_sensor_readings_raw already running; skipping';
    RETURN;
  END IF;
  PERFORM public.cleanup_sensor_readings_raw();
END $$;

REVOKE ALL ON FUNCTION public.guarded_rollup_sensor_hourly() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.guarded_rollup_meter_power_hourly() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.guarded_cleanup_bridge_raw_samples() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.guarded_cleanup_sensor_readings_raw() FROM PUBLIC, anon, authenticated;

-- 3) Point the guarded jobs at the wrappers (by name, no fixed job ids)
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT * FROM (VALUES
    ('sensor-rollup-hourly',              'SELECT public.guarded_rollup_sensor_hourly();'),
    ('ems-rollup-power-hourly',           'SELECT public.guarded_rollup_meter_power_hourly();'),
    ('cleanup-bridge-raw-samples-hourly', 'SELECT public.guarded_cleanup_bridge_raw_samples();'),
    ('sensor-readings-raw-cleanup',       'SELECT public.guarded_cleanup_sensor_readings_raw();')
  ) AS v(name, cmd) LOOP
    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = r.name) THEN
      PERFORM cron.alter_job((SELECT jobid FROM cron.job WHERE jobname = r.name), command => r.cmd);
    END IF;
  END LOOP;
END $$;

-- 4) De-collide schedules: every periodic job gets its own minute
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT * FROM (VALUES
    -- hourly group (was: three jobs on minute 5, two on minute 17, one on minute 0)
    ('sensor-rollup-hourly',                 '5 * * * *'),
    ('ems-pv-forecast',                      '7 * * * *'),
    ('ems-fetch-spot-prices',                '15 * * * *'),
    ('cleanup-bridge-raw-samples-hourly',    '17 * * * *'),
    ('aggregate-pv-actual-hourly',           '19 * * * *'),
    ('refresh-meter-period-totals-5min',     '21,51 * * * *'),
    ('sensor-readings-raw-cleanup',          '23 * * * *'),
    ('charge-point-auto-reboot-hourly',      '27 * * * *'),
    ('ems-rollup-power-hourly',              '29 * * * *'),
    ('lexware-sync-status-hourly',           '33 * * * *'),
    -- hourly job that was mis-scheduled: name says daily, ran every hour
    ('bridge_event_log_cleanup_daily',       '47 3 * * *'),
    -- nightly window spread out; deletes first, VACUUM afterwards
    ('refresh-meter-daily-totals',           '25 0 * * *'),
    ('dlm-control-log-cleanup-daily',        '20 3 * * *'),
    ('sensor-cleanup-hourly',                '55 3 * * *'),
    ('vacuum-power-readings-buffer',         '30 4 * * *'),
    ('cleanup-audit-logs-monthly',           '10 5 1 * *')
  ) AS v(name, sched) LOOP
    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = r.name) THEN
      PERFORM cron.alter_job((SELECT jobid FROM cron.job WHERE jobname = r.name), schedule => r.sched);
    END IF;
  END LOOP;
END $$;

-- 5) Collision checker for future changes
CREATE OR REPLACE FUNCTION public.cron_schedule_collisions()
RETURNS TABLE(schedule text, job_count bigint, jobs text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT j.schedule::text, count(*), string_agg(j.jobname, ', ' ORDER BY j.jobname)
  FROM cron.job j
  WHERE j.active
  GROUP BY j.schedule
  HAVING count(*) > 1
  ORDER BY count(*) DESC
$$;
REVOKE ALL ON FUNCTION public.cron_schedule_collisions() FROM PUBLIC, anon;