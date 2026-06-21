-- Remove broken one-shot (VACUUM inside DO/EXECUTE silently failed due to SPI restriction)
SELECT cron.unschedule('mdtm-vacuum-oneshot');

-- New one-shot: bare VACUUM command. pg_cron's background worker executes
-- top-level VACUUM directly (libpq path), bypassing the SPI/transaction limitation.
-- Runs every minute until manually unscheduled in a follow-up migration.
SELECT cron.schedule(
  'mdtm-vacuum-oneshot-v2',
  '* * * * *',
  $$VACUUM (ANALYZE) public.meter_daily_totals_mv$$
);