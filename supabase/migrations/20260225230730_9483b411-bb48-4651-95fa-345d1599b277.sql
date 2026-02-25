
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
    -- Use pre-aggregated 5min data (cast numeric to double precision)
    RETURN QUERY
    SELECT m5.meter_id, m5.power_avg::double precision, m5.bucket
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
