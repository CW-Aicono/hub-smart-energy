CREATE OR REPLACE FUNCTION public.get_power_readings_5min(p_meter_ids uuid[], p_start timestamp with time zone, p_end timestamp with time zone)
 RETURNS TABLE(meter_id uuid, power_avg double precision, bucket timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  RETURN QUERY
  WITH combined AS (
    -- WS-Bridge 5min table (preferred, neuer Pfad)
    SELECT
      b.meter_id,
      b.power_avg::double precision AS power_avg,
      b.bucket,
      COALESCE(b.sample_count, 1) + 1000 AS sample_count -- bevorzugt
    FROM meter_power_readings_5min_bridge b
    WHERE b.meter_id = ANY(p_meter_ids)
      AND b.bucket >= p_start
      AND b.bucket <= p_end

    UNION ALL

    -- Legacy pre-aggregated 5min table
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

    -- On-the-fly aggregation from raw readings (legacy polling)
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