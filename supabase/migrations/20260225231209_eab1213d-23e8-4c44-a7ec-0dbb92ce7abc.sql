
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
BEGIN
  -- Return UNION of pre-aggregated 5min data AND on-the-fly aggregated raw data.
  -- The raw aggregation only produces buckets that don't already exist in the 5min table,
  -- so there's no double-counting.
  RETURN QUERY
  -- 1) Pre-aggregated 5min data
  SELECT m5.meter_id, m5.power_avg::double precision, m5.bucket
  FROM meter_power_readings_5min m5
  WHERE m5.meter_id = ANY(p_meter_ids)
    AND m5.bucket >= p_start
    AND m5.bucket <= p_end

  UNION ALL

  -- 2) On-the-fly aggregated raw data for buckets NOT in the 5min table
  SELECT
    r.meter_id,
    avg(r.power_value)::double precision AS power_avg,
    date_trunc('hour', r.recorded_at) + 
      (floor(extract(minute from r.recorded_at) / 5) * interval '5 minutes') AS bucket
  FROM meter_power_readings r
  WHERE r.meter_id = ANY(p_meter_ids)
    AND r.recorded_at >= p_start
    AND r.recorded_at <= p_end
    -- Exclude buckets already covered by the 5min table
    AND NOT EXISTS (
      SELECT 1 FROM meter_power_readings_5min m5x
      WHERE m5x.meter_id = r.meter_id
        AND m5x.bucket = date_trunc('hour', r.recorded_at) + 
          (floor(extract(minute from r.recorded_at) / 5) * interval '5 minutes')
    )
  GROUP BY r.meter_id, date_trunc('hour', r.recorded_at) + 
    (floor(extract(minute from r.recorded_at) / 5) * interval '5 minutes')

  ORDER BY bucket;
END;
$$;
