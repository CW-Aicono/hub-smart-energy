
CREATE OR REPLACE FUNCTION public._oneshot_delete_energiemonitor()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_meter uuid := '1582b895-feb0-4de2-b1b5-9f7960b7b889';
  v_deleted bigint;
BEGIN
  PERFORM set_config('statement_timeout','0',true);
  LOOP
    WITH d AS (
      DELETE FROM public.meter_power_readings
      WHERE ctid IN (
        SELECT ctid FROM public.meter_power_readings
        WHERE meter_id = v_meter
        LIMIT 100000
      )
      RETURNING 1
    )
    SELECT count(*) INTO v_deleted FROM d;
    EXIT WHEN v_deleted = 0;
  END LOOP;
  LOOP
    WITH d AS (
      DELETE FROM public.meter_power_readings_5min
      WHERE ctid IN (
        SELECT ctid FROM public.meter_power_readings_5min
        WHERE meter_id = v_meter
        LIMIT 100000
      )
      RETURNING 1
    )
    SELECT count(*) INTO v_deleted FROM d;
    EXIT WHEN v_deleted = 0;
  END LOOP;
  DELETE FROM public.meter_readings WHERE meter_id = v_meter;
  DELETE FROM public.meter_period_totals WHERE meter_id = v_meter;
  DELETE FROM public.pv_actual_hourly WHERE meter_id = v_meter;
  DELETE FROM public.energy_prices WHERE meter_id = v_meter;
  DELETE FROM public.meters WHERE id = v_meter;
  PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname = 'oneshot-delete-energiemonitor';
END $$;

SELECT cron.schedule(
  'oneshot-delete-energiemonitor',
  '* * * * *',
  $$ SELECT public._oneshot_delete_energiemonitor(); $$
);
