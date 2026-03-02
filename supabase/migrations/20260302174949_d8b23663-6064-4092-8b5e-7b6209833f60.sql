
-- Update the RPC to also sum monthly data when no daily data exists for a meter
CREATE OR REPLACE FUNCTION public.get_meter_period_sums(
  p_meter_ids uuid[],
  p_from_date date,
  p_to_date date
)
RETURNS TABLE(meter_id uuid, total_value double precision)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH daily_sums AS (
    SELECT
      mpt.meter_id,
      SUM(mpt.total_value) AS total_val
    FROM meter_period_totals mpt
    WHERE mpt.meter_id = ANY(p_meter_ids)
      AND mpt.period_type = 'day'
      AND mpt.period_start::date >= p_from_date
      AND mpt.period_start::date <= p_to_date
    GROUP BY mpt.meter_id
  ),
  monthly_sums AS (
    SELECT
      mpt.meter_id,
      SUM(mpt.total_value) AS total_val
    FROM meter_period_totals mpt
    WHERE mpt.meter_id = ANY(p_meter_ids)
      AND mpt.period_type = 'month'
      AND mpt.period_start::date >= date_trunc('month', p_from_date)::date
      AND mpt.period_start::date <= p_to_date
      AND NOT EXISTS (
        SELECT 1 FROM daily_sums ds WHERE ds.meter_id = mpt.meter_id
      )
    GROUP BY mpt.meter_id
  )
  SELECT ds.meter_id, ds.total_val::double precision AS total_value FROM daily_sums ds
  UNION ALL
  SELECT ms.meter_id, ms.total_val::double precision AS total_value FROM monthly_sums ms;
END;
$$;
