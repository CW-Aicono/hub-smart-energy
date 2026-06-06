-- 1) FIX compact_power_readings_day (ON CONFLICT an Unique-Index angepasst)
CREATE OR REPLACE FUNCTION public.compact_power_readings_day(p_day date DEFAULT ((CURRENT_DATE - '1 day'::interval))::date)
 RETURNS TABLE(compacted_buckets bigint, deleted_raw bigint)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_start timestamptz;
  v_end timestamptz;
  v_compacted bigint;
  v_deleted bigint;
BEGIN
  v_start := p_day::timestamptz;
  v_end := (p_day + interval '1 day')::timestamptz;

  INSERT INTO meter_power_readings_5min
    (meter_id, tenant_id, energy_type, bucket, power_avg, power_max, sample_count, resolution_minutes)
  SELECT
    r.meter_id,
    r.tenant_id,
    r.energy_type,
    date_trunc('hour', r.recorded_at) +
      (floor(extract(minute from r.recorded_at) / 5) * interval '5 minutes') AS bucket,
    percentile_cont(0.5) WITHIN GROUP (ORDER BY r.power_value) AS power_avg,
    max(r.power_value) AS power_max,
    count(*)::integer AS sample_count,
    5 AS resolution_minutes
  FROM meter_power_readings r
  WHERE r.recorded_at >= v_start AND r.recorded_at < v_end
  GROUP BY r.meter_id, r.tenant_id, r.energy_type,
    date_trunc('hour', r.recorded_at) +
      (floor(extract(minute from r.recorded_at) / 5) * interval '5 minutes')
  ON CONFLICT (meter_id, bucket, resolution_minutes)
  DO UPDATE SET
    power_avg = EXCLUDED.power_avg,
    power_max = EXCLUDED.power_max,
    sample_count = EXCLUDED.sample_count;

  GET DIAGNOSTICS v_compacted = ROW_COUNT;

  DELETE FROM meter_power_readings
  WHERE recorded_at >= v_start AND recorded_at < v_end;

  GET DIAGNOSTICS v_deleted = ROW_COUNT;

  compacted_buckets := v_compacted;
  deleted_raw := v_deleted;
  RETURN NEXT;
END;
$function$;

-- 2) Retention cron.job_run_details (7 Tage)
CREATE OR REPLACE FUNCTION public.cleanup_cron_job_history()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_deleted integer;
BEGIN
  DELETE FROM cron.job_run_details WHERE start_time < now() - interval '7 days';
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$function$;

-- 3) Retention net._http_response (1 Tag)
CREATE OR REPLACE FUNCTION public.cleanup_pg_net_responses()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_deleted integer;
BEGIN
  DELETE FROM net._http_response WHERE created < now() - interval '1 day';
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$function$;

-- Cron-Jobs einplanen (idempotent)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname='cleanup-cron-history-daily') THEN
    PERFORM cron.unschedule('cleanup-cron-history-daily');
  END IF;
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname='cleanup-pg-net-daily') THEN
    PERFORM cron.unschedule('cleanup-pg-net-daily');
  END IF;
END $$;

SELECT cron.schedule('cleanup-cron-history-daily', '40 3 * * *', $$ SELECT public.cleanup_cron_job_history(); $$);
SELECT cron.schedule('cleanup-pg-net-daily',      '45 3 * * *', $$ SELECT public.cleanup_pg_net_responses(); $$);
