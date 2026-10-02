ANALYZE public.meter_power_readings_5min;

SELECT cron.schedule(
  'ems-oneoff-vacuum-5min-part',
  '*/5 * * * *',
  $$
  DO $inner$
  BEGIN
    PERFORM 1;
  END
  $inner$;
  $$
);
SELECT cron.unschedule('ems-oneoff-vacuum-5min-part');