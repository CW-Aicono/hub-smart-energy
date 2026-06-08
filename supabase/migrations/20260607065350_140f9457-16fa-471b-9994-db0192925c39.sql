
CREATE OR REPLACE FUNCTION public.cleanup_cron_job_history()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $f$
DECLARE v_deleted integer;
BEGIN
  DELETE FROM cron.job_run_details WHERE start_time < now() - interval '2 days';
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END; $f$;

CREATE OR REPLACE FUNCTION public.cleanup_pg_net_responses()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $f$
DECLARE v_deleted integer;
BEGIN
  DELETE FROM net._http_response WHERE created < now() - interval '12 hours';
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END; $f$;

-- Idempotenter Unschedule: cron.unschedule(name) wirft ERROR, wenn der Job
-- nicht existiert. Auf Prod-Hetzner hat z.B. der DLM-Job nie existiert,
-- darum DO-Block mit Existenzcheck pro Job.
DO $mig$
DECLARE
  job_name text;
  jobs text[] := ARRAY[
    'dlm-realtime-controller-every-minute',
    'ems-loxone-periodic-sync',
    'ems-gateway-periodic-sync',
    'ems-cheap-charging-scheduler',
    'ems-solar-charging-scheduler',
    'cleanup-stale-integration-errors-daily'
  ];
BEGIN
  FOREACH job_name IN ARRAY jobs LOOP
    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = job_name) THEN
      PERFORM cron.unschedule(job_name);
    END IF;
  END LOOP;
END $mig$;

SELECT cron.schedule('ems-loxone-periodic-sync',     '*/2 * * * *', $$SELECT private.invoke_edge_function('loxone-periodic-sync');$$);
SELECT cron.schedule('ems-gateway-periodic-sync',    '*/2 * * * *', $$SELECT private.invoke_edge_function('gateway-periodic-sync');$$);
SELECT cron.schedule('ems-cheap-charging-scheduler', '*/2 * * * *', $$SELECT private.invoke_edge_function('cheap-charging-scheduler');$$);
SELECT cron.schedule('ems-solar-charging-scheduler', '*/2 * * * *', $$SELECT private.invoke_edge_function('solar-charging-scheduler');$$);

CREATE OR REPLACE FUNCTION public.cleanup_stale_integration_errors()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $f$
DECLARE v_count integer;
BEGIN
  UPDATE public.integration_errors
     SET is_resolved = true, resolved_at = now()
   WHERE is_resolved = false
     AND updated_at < now() - interval '24 hours';
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END; $f$;

SELECT cron.schedule(
  'cleanup-stale-integration-errors-daily',
  '50 3 * * *',
  $$SELECT public.cleanup_stale_integration_errors();$$
);
