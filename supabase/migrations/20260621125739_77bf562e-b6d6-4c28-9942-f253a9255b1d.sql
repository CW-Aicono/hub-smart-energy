-- Ensure pg_cron is available (already installed, idempotent guard)
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- 1) One-shot VACUUM (ANALYZE) ~60s after migration to set the visibility map immediately.
--    Cron is scheduled in UTC; we pick a fixed minute slot in the near future and unschedule itself after running.
SELECT cron.schedule(
  'mdtm-vacuum-oneshot',
  '*/1 * * * *',
  $$
  DO $body$
  BEGIN
    EXECUTE 'VACUUM (ANALYZE) public.meter_daily_totals_mv';
    PERFORM cron.unschedule('mdtm-vacuum-oneshot');
  END
  $body$;
  $$
);

-- 2) Recurring nightly VACUUM (ANALYZE) at 04:15 UTC.
--    Sets the visibility map after the daily REFRESH MATERIALIZED VIEW so the
--    Index-Only-Scan in get_meter_period_sums_with_fallback stays free of heap fetches.
SELECT cron.schedule(
  'mdtm-vacuum-nightly',
  '15 4 * * *',
  $$VACUUM (ANALYZE) public.meter_daily_totals_mv$$
);