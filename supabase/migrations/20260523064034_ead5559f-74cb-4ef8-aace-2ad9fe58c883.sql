DO $$
DECLARE
  v_id bigint;
  v_names text[] := ARRAY[
    'automation-scheduler-every-2min',
    'dlm-scheduler-every-minute',
    'cheap-charging-scheduler-every-5min',
    'solar-charging-scheduler-every-2min',
    'power-limit-scheduler-every-5min',
    'brighthub-intraday-sync',
    'brighthub-readings-sync',
    'loxone-power-readings-sync',
    'gateway-power-readings-sync',
    'fetch-spot-prices-hourly'
  ];
  v_name text;
BEGIN
  FOREACH v_name IN ARRAY v_names LOOP
    SELECT jobid INTO v_id FROM cron.job WHERE jobname = v_name;
    IF v_id IS NOT NULL THEN
      PERFORM cron.alter_job(job_id := v_id, active := false);
    END IF;
  END LOOP;
END $$;