DO $$
DECLARE
  keep_jobid bigint;
BEGIN
  SELECT jobid INTO keep_jobid
  FROM cron.job
  WHERE command ILIKE '%sensor-history-aggregator%'
  ORDER BY jobid DESC
  LIMIT 1;

  IF keep_jobid IS NOT NULL THEN
    PERFORM cron.unschedule(jobid)
    FROM cron.job
    WHERE command ILIKE '%sensor-history-aggregator%'
      AND jobid <> keep_jobid;
  END IF;
END;
$$;