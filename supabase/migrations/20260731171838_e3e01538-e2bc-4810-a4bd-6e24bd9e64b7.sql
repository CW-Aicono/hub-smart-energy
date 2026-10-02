SELECT cron.unschedule(109) WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobid = 109);
SELECT cron.unschedule(70) WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobid = 70);