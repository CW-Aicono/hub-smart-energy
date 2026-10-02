-- Täglicher Loxone-Tagessummen-Abgleich um 01:05 UTC
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'ems-loxone-daily-totals-backfill') THEN
    PERFORM cron.unschedule('ems-loxone-daily-totals-backfill');
  END IF;

  PERFORM cron.schedule(
    'ems-loxone-daily-totals-backfill',
    '5 1 * * *',
    $cron$SELECT private.invoke_edge_function('loxone-daily-totals-backfill');$cron$
  );
END $$;