DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'peak-shaving-monthly-report') THEN
    PERFORM cron.alter_job((SELECT jobid FROM cron.job WHERE jobname = 'peak-shaving-monthly-report'), schedule => '40 6 1 * *');
  END IF;
END $$;