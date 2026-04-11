
CREATE OR REPLACE FUNCTION public.get_meter_daily_totals_split(
  p_meter_ids uuid[],
  p_from_date date,
  p_to_date date
)
RETURNS TABLE(meter_id uuid, day date, bezug double precision, einspeisung double precision)
LANGUAGE plpgsql STABLE
AS $$
BEGIN
  RETURN QUERY
  -- Use 5-min aggregated data to split positive/negative
  SELECT
    m5.meter_id,
    m5.bucket::date AS day,
    COALESCE(SUM(CASE WHEN m5.power_avg >= 0 THEN m5.power_avg * (5.0/60.0) ELSE 0 END), 0)::double precision AS bezug,
    COALESCE(SUM(CASE WHEN m5.power_avg < 0 THEN ABS(m5.power_avg) * (5.0/60.0) ELSE 0 END), 0)::double precision AS einspeisung
  FROM meter_power_readings_5min m5
  WHERE m5.meter_id = ANY(p_meter_ids)
    AND m5.bucket::date >= p_from_date
    AND m5.bucket::date <= p_to_date
  GROUP BY m5.meter_id, m5.bucket::date

  UNION ALL

  -- Fallback: for days with no 5-min data, use meter_period_totals
  SELECT
    mpt.meter_id,
    mpt.period_start::date AS day,
    CASE WHEN mpt.total_value >= 0 THEN mpt.total_value::double precision ELSE 0 END AS bezug,
    CASE WHEN mpt.total_value < 0 THEN ABS(mpt.total_value)::double precision ELSE 0 END AS einspeisung
  FROM meter_period_totals mpt
  WHERE mpt.meter_id = ANY(p_meter_ids)
    AND mpt.period_type = 'day'
    AND mpt.period_start::date >= p_from_date
    AND mpt.period_start::date <= p_to_date
    AND NOT EXISTS (
      SELECT 1 FROM meter_power_readings_5min m5x
      WHERE m5x.meter_id = mpt.meter_id
        AND m5x.bucket::date = mpt.period_start::date
    )
  ORDER BY day;
END;
$$;
