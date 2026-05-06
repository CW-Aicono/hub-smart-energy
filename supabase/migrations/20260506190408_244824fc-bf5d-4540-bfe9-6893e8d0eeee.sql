CREATE INDEX IF NOT EXISTS idx_meter_period_totals_tenant_meter_type_start
ON public.meter_period_totals (tenant_id, meter_id, period_type, period_start);

CREATE OR REPLACE FUNCTION public.get_meter_period_sums_with_fallback(
  p_meter_ids uuid[],
  p_from_date date,
  p_to_date date
)
RETURNS TABLE(meter_id uuid, total_value double precision)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant_id uuid;
BEGIN
  v_tenant_id := public.get_user_tenant_id();

  IF v_tenant_id IS NULL OR p_meter_ids IS NULL OR array_length(p_meter_ids, 1) IS NULL THEN
    RETURN;
  END IF;

  -- Current-day widgets use live gateway totals on the client. Avoid touching the
  -- large 5-minute table for a same-day request, which was causing statement timeouts.
  IF p_from_date >= CURRENT_DATE THEN
    RETURN QUERY
    SELECT
      mpt.meter_id,
      SUM(ABS(mpt.total_value))::double precision AS total_value
    FROM public.meter_period_totals mpt
    WHERE mpt.tenant_id = v_tenant_id
      AND mpt.meter_id = ANY(p_meter_ids)
      AND mpt.period_type = 'day'
      AND mpt.period_start BETWEEN p_from_date AND p_to_date
    GROUP BY mpt.meter_id
    HAVING SUM(ABS(mpt.total_value)) <> 0;
    RETURN;
  END IF;

  RETURN QUERY
  WITH requested_meters AS (
    SELECT unnest(p_meter_ids) AS meter_id
  ),
  days_in_range AS (
    SELECT generate_series(p_from_date, LEAST(p_to_date, CURRENT_DATE - 1), interval '1 day')::date AS day
  ),
  archived_sums AS (
    SELECT
      mpt.meter_id,
      SUM(ABS(mpt.total_value))::double precision AS sum_value
    FROM public.meter_period_totals mpt
    WHERE mpt.tenant_id = v_tenant_id
      AND mpt.meter_id = ANY(p_meter_ids)
      AND mpt.period_type = 'day'
      AND mpt.period_start BETWEEN p_from_date AND p_to_date
    GROUP BY mpt.meter_id
  ),
  missing_days AS (
    SELECT rm.meter_id, d.day
    FROM requested_meters rm
    CROSS JOIN days_in_range d
    WHERE NOT EXISTS (
      SELECT 1
      FROM public.meter_period_totals mpt
      WHERE mpt.tenant_id = v_tenant_id
        AND mpt.meter_id = rm.meter_id
        AND mpt.period_type = 'day'
        AND mpt.period_start = d.day
    )
  ),
  fallback_sums AS (
    SELECT
      md.meter_id,
      SUM(ABS(m5.power_avg::double precision) * (5.0 / 60.0))::double precision AS sum_value
    FROM missing_days md
    JOIN public.meter_power_readings_5min m5
      ON m5.tenant_id = v_tenant_id
     AND m5.meter_id = md.meter_id
     AND m5.bucket >= md.day::timestamptz
     AND m5.bucket < (md.day + 1)::timestamptz
    GROUP BY md.meter_id
  )
  SELECT
    rm.meter_id,
    (COALESCE(a.sum_value, 0) + COALESCE(f.sum_value, 0))::double precision AS total_value
  FROM requested_meters rm
  LEFT JOIN archived_sums a ON a.meter_id = rm.meter_id
  LEFT JOIN fallback_sums f ON f.meter_id = rm.meter_id
  WHERE COALESCE(a.sum_value, 0) + COALESCE(f.sum_value, 0) <> 0;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_meter_period_sums_with_fallback(uuid[], date, date) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_meter_period_sums_with_fallback(uuid[], date, date) TO authenticated;