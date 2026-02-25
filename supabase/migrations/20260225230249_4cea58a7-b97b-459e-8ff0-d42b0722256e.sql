
-- Update the daily compaction cron job to use the new DB function directly
-- This is more reliable than calling the edge function via HTTP
SELECT cron.unschedule('compact-meter-power-readings-daily');

SELECT cron.schedule(
  'compact-meter-power-readings-daily',
  '5 0 * * *',
  $$SELECT * FROM compact_power_readings_day()$$
);
