DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'gap-backfill-hourly') THEN
    PERFORM cron.unschedule('gap-backfill-hourly');
  END IF;
  PERFORM cron.schedule('gap-backfill-hourly', '23 * * * *',
    $cmd$SELECT private.invoke_edge_function('gap-backfill-scheduler');$cmd$);
END $$;