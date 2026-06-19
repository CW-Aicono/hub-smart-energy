
SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname='oneshot-delete-energiemonitor';
DROP FUNCTION IF EXISTS public._oneshot_delete_energiemonitor();
