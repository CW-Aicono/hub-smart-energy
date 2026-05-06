-- Server-side period sums with on-the-fly fallback from 5-min data.
-- Replaces the slow client-side fallback in usePeriodSumsWithFallback.
-- Returns one row per meter with the total energy in the requested range.

CREATE OR REPLACE FUNCTION public.get_meter_period_sums_with_fallback(
  p_meter_ids uuid[],
  p_from_date date,
  p_to_date date
)
RETURNS TABLE(meter_id uuid, total_value double precision)
LANGUAGE sql STABLE
SET search_path = public
AS $$
  WITH days_in_range AS (
    SELECT generate_series(p_from_date, p_to_date, interval '1 day')::date AS d
  ),
  -- Days where we already have archived daily totals
  daily_archived AS (
    SELECT DISTINCT meter_id, period_start::date AS day
    FROM meter_period_totals
    WHERE meter_id = ANY(p_meter_ids)
      AND period_type = 'day'
      AND period_start::date BETWEEN p_from_date AND p_to_date
  ),
  -- Sum from archived daily totals (uses absolute value so feed-in counts as energy turnover)
  archived_sums AS (
    SELECT
      mpt.meter_id,
      SUM(ABS(mpt.total_value))::double precision AS sum_value
    FROM meter_period_totals mpt
    WHERE mpt.meter_id = ANY(p_meter_ids)
      AND mpt.period_type = 'day'
      AND mpt.period_start::date BETWEEN p_from_date AND p_to_date
    GROUP BY mpt.meter_id
  ),
  -- For each meter: which days are missing from the archive?
  missing_per_meter AS (
    SELECT
      mid AS meter_id,
      d.d AS day
    FROM unnest(p_meter_ids) AS mid
    CROSS JOIN days_in_range d
    LEFT JOIN daily_archived da ON da.meter_id = mid AND da.day = d.d
    WHERE da.meter_id IS NULL
      AND d.d < CURRENT_DATE   -- today is covered by live totals on the client
  ),
  -- Aggregate 5-min readings for missing days, server-side
  fallback_sums AS (
    SELECT
      m5.meter_id,
      SUM(ABS(m5.power_avg) * (5.0/60.0))::double precision AS sum_value
    FROM meter_power_readings_5min m5
    JOIN missing_per_meter mpm
      ON mpm.meter_id = m5.meter_id
     AND mpm.day = m5.bucket::date
    GROUP BY m5.meter_id
  )
  SELECT
    mid AS meter_id,
    (COALESCE(a.sum_value, 0) + COALESCE(f.sum_value, 0))::double precision AS total_value
  FROM unnest(p_meter_ids) AS mid
  LEFT JOIN archived_sums a ON a.meter_id = mid
  LEFT JOIN fallback_sums f ON f.meter_id = mid
  WHERE COALESCE(a.sum_value, 0) + COALESCE(f.sum_value, 0) > 0;
$$;

REVOKE EXECUTE ON FUNCTION public.get_meter_period_sums_with_fallback(uuid[], date, date) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_meter_period_sums_with_fallback(uuid[], date, date) TO authenticated;