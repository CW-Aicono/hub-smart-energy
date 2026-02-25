
-- 1. Server-side function to return 5min-aggregated power data for a day
-- Falls back to raw data aggregation when 5min table has no data
CREATE OR REPLACE FUNCTION public.get_power_readings_5min(
  p_meter_ids uuid[],
  p_start timestamptz,
  p_end timestamptz
)
RETURNS TABLE(meter_id uuid, power_avg double precision, bucket timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer;
BEGIN
  -- Check if 5min table has data for this range
  SELECT count(*) INTO v_count
  FROM meter_power_readings_5min m5
  WHERE m5.meter_id = ANY(p_meter_ids)
    AND m5.bucket >= p_start
    AND m5.bucket <= p_end;

  IF v_count > 0 THEN
    -- Use pre-aggregated 5min data
    RETURN QUERY
    SELECT m5.meter_id, m5.power_avg, m5.bucket
    FROM meter_power_readings_5min m5
    WHERE m5.meter_id = ANY(p_meter_ids)
      AND m5.bucket >= p_start
      AND m5.bucket <= p_end
    ORDER BY m5.bucket;
  ELSE
    -- Aggregate raw data on-the-fly into 5min buckets
    RETURN QUERY
    SELECT
      r.meter_id,
      avg(r.power_value)::double precision AS power_avg,
      date_trunc('hour', r.recorded_at) + 
        (floor(extract(minute from r.recorded_at) / 5) * interval '5 minutes') AS bucket
    FROM meter_power_readings r
    WHERE r.meter_id = ANY(p_meter_ids)
      AND r.recorded_at >= p_start
      AND r.recorded_at <= p_end
    GROUP BY r.meter_id, date_trunc('hour', r.recorded_at) + 
      (floor(extract(minute from r.recorded_at) / 5) * interval '5 minutes')
    ORDER BY bucket;
  END IF;
END;
$$;

-- 2. Function to compact a specific day's raw data into 5min aggregates
-- Can be called manually or from cron
CREATE OR REPLACE FUNCTION public.compact_power_readings_day(
  p_day date DEFAULT (current_date - interval '1 day')::date
)
RETURNS TABLE(compacted_buckets bigint, deleted_raw bigint)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_start timestamptz;
  v_end timestamptz;
  v_compacted bigint;
  v_deleted bigint;
BEGIN
  v_start := p_day::timestamptz;
  v_end := (p_day + interval '1 day')::timestamptz;

  -- Upsert aggregated data into 5min table
  INSERT INTO meter_power_readings_5min (meter_id, tenant_id, energy_type, bucket, power_avg, power_max, sample_count)
  SELECT
    r.meter_id,
    r.tenant_id,
    r.energy_type,
    date_trunc('hour', r.recorded_at) + 
      (floor(extract(minute from r.recorded_at) / 5) * interval '5 minutes') AS bucket,
    avg(r.power_value) AS power_avg,
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

  -- Delete raw data for that day
  DELETE FROM meter_power_readings
  WHERE recorded_at >= v_start AND recorded_at < v_end;

  GET DIAGNOSTICS v_deleted = ROW_COUNT;

  compacted_buckets := v_compacted;
  deleted_raw := v_deleted;
  RETURN NEXT;
END;
$$;
