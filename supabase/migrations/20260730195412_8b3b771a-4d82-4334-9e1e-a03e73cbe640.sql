DO $$
DECLARE
  target record;
  jid bigint;
BEGIN
  FOR target IN
    SELECT * FROM (VALUES
      ('ems-automation-scheduler',              '* * * * *'),
      ('ems-cheap-charging-scheduler',          '0-59/2 * * * *'),
      ('ems-dlm-scheduler',                     '1-59/2 * * * *'),
      ('ems-gateway-periodic-sync',             '0-59/2 * * * *'),
      ('ems-solar-charging-scheduler',          '1-59/2 * * * *'),
      ('bridge-aggregator-every-5min',          '0-59/5 * * * *'),
      ('ems-brighthub-periodic-sync',           '1-59/5 * * * *'),
      ('ems-power-limit-scheduler',             '2-59/5 * * * *'),
      ('monitoring-collect-5min',               '3-59/5 * * * *'),
      ('monitoring-evaluate-5min',              '4-59/5 * * * *'),
      ('peak-shaving-scheduler-every-minute',   '2-59/5 * * * *'),
      ('sensor-aggregator-5min',                '3-59/5 * * * *'),
      ('snapshot-charge-point-uptime',          '4-59/5 * * * *'),
      ('ems-rollup-power-hourly',               '5-59/10 * * * *'),
      ('peak-shaving-event-prep-10min',         '8-59/10 * * * *'),
      ('ems-backfill-power-hourly',             '3-59/10 * * * *'),
      ('charging-report-scheduler-every-15min', '6-59/15 * * * *'),
      ('close-orphan-gateway-ws-sessions',      '7-59/15 * * * *'),
      ('collect-infra-metrics-15min',           '9-59/15 * * * *'),
      ('loxone-periodic-sync-15min',            '11-59/15 * * * *'),
      ('loxone-template-heartbeat',             '13-59/15 * * * *'),
      ('refresh-meter-period-totals-5min',      '14,44 * * * *')
    ) AS t(jobname, schedule)
  LOOP
    SELECT j.jobid INTO jid FROM cron.job j WHERE j.jobname = target.jobname LIMIT 1;
    IF jid IS NULL THEN
      RAISE NOTICE 'cron job % not present - skipped', target.jobname;
      CONTINUE;
    END IF;
    BEGIN
      PERFORM cron.alter_job(jid, schedule => target.schedule);
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'could not alter cron job % (%): %', target.jobname, jid, SQLERRM;
    END;
  END LOOP;
END $$;