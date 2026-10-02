-- 1) get_power_readings_5min: prefer rows with higher sample_count per (meter_id, bucket)
CREATE OR REPLACE FUNCTION public.get_power_readings_5min(
  p_meter_ids uuid[],
  p_start timestamp with time zone,
  p_end timestamp with time zone
)
RETURNS TABLE(meter_id uuid, power_avg double precision, bucket timestamp with time zone)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  RETURN QUERY
  WITH combined AS (
    -- Pre-aggregated 5min table
    SELECT
      m5.meter_id,
      m5.power_avg::double precision AS power_avg,
      m5.bucket,
      COALESCE(m5.sample_count, 1) AS sample_count
    FROM meter_power_readings_5min m5
    WHERE m5.meter_id = ANY(p_meter_ids)
      AND m5.bucket >= p_start
      AND m5.bucket <= p_end

    UNION ALL

    -- On-the-fly aggregation from raw readings (no exclusion filter)
    SELECT
      r.meter_id,
      avg(r.power_value)::double precision AS power_avg,
      date_trunc('hour', r.recorded_at) +
        (floor(extract(minute from r.recorded_at) / 5) * interval '5 minutes') AS bucket,
      count(*)::integer AS sample_count
    FROM meter_power_readings r
    WHERE r.meter_id = ANY(p_meter_ids)
      AND r.recorded_at >= p_start
      AND r.recorded_at <= p_end
    GROUP BY r.meter_id, date_trunc('hour', r.recorded_at) +
      (floor(extract(minute from r.recorded_at) / 5) * interval '5 minutes')
  )
  SELECT DISTINCT ON (c.meter_id, c.bucket)
    c.meter_id,
    c.power_avg,
    c.bucket
  FROM combined c
  ORDER BY c.meter_id, c.bucket, c.sample_count DESC;
END;
$function$;

-- 2) compact_power_readings_day: use median instead of avg (power_max stays real max)
CREATE OR REPLACE FUNCTION public.compact_power_readings_day(
  p_day date DEFAULT ((CURRENT_DATE - '1 day'::interval))::date
)
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

  INSERT INTO meter_power_readings_5min (meter_id, tenant_id, energy_type, bucket, power_avg, power_max, sample_count)
  SELECT
    r.meter_id,
    r.tenant_id,
    r.energy_type,
    date_trunc('hour', r.recorded_at) +
      (floor(extract(minute from r.recorded_at) / 5) * interval '5 minutes') AS bucket,
    percentile_cont(0.5) WITHIN GROUP (ORDER BY r.power_value) AS power_avg,
    max(r.power_value) AS power_max,
    count(*)::integer AS sample_count
  FROM meter_power_readings r
  WHERE r.recorded_at >= v_start AND r.recorded_at < v_end
  GROUP BY r.meter_id, r.tenant_id, r.energy_type,
    date_trunc('hour', r.recorded_at) +
      (floor(extract(minute from r.recorded_at) / 5) * interval '5 minutes')
  ON CONFLICT (meter_id, bucket)
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