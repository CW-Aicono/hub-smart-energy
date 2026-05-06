CREATE OR REPLACE FUNCTION public.get_meter_daily_totals_split_with_fallback(
  p_meter_ids uuid[],
  p_from_date date,
  p_to_date date
)
RETURNS TABLE(meter_id uuid, day date, bezug double precision, einspeisung double precision)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_tenant_id uuid;
BEGIN
  v_tenant_id := public.get_user_tenant_id();

  IF v_tenant_id IS NULL OR p_meter_ids IS NULL OR array_length(p_meter_ids, 1) IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  WITH requested_meters AS (
    SELECT unnest(p_meter_ids) AS meter_id
  ),
  -- Days that exist in meter_period_totals (archived daily totals)
  archived AS (
    SELECT
      mpt.meter_id,
      mpt.period_start::date AS day,
      CASE WHEN mpt.total_value >= 0 THEN mpt.total_value::double precision ELSE 0 END AS bezug,
      CASE WHEN mpt.total_value < 0 THEN ABS(mpt.total_value)::double precision ELSE 0 END AS einspeisung
    FROM public.meter_period_totals mpt
    WHERE mpt.tenant_id = v_tenant_id
      AND mpt.meter_id = ANY(p_meter_ids)
      AND mpt.period_type = 'day'
      AND mpt.period_start::date >= p_from_date
      AND mpt.period_start::date <= p_to_date
  ),
  -- 5-min fallback ONLY for days that aren't archived yet (typically: today)
  fallback AS (
    SELECT
      m5.meter_id,
      m5.bucket::date AS day,
      COALESCE(SUM(CASE WHEN m5.power_avg >= 0 THEN m5.power_avg * (5.0/60.0) ELSE 0 END), 0)::double precision AS bezug,
      COALESCE(SUM(CASE WHEN m5.power_avg < 0 THEN ABS(m5.power_avg) * (5.0/60.0) ELSE 0 END), 0)::double precision AS einspeisung
    FROM public.meter_power_readings_5min m5
    WHERE m5.tenant_id = v_tenant_id
      AND m5.meter_id = ANY(p_meter_ids)
      AND m5.bucket >= p_from_date::timestamptz
      AND m5.bucket < (p_to_date + 1)::timestamptz
      AND NOT EXISTS (
        SELECT 1 FROM public.meter_period_totals mpt
        WHERE mpt.tenant_id = v_tenant_id
          AND mpt.meter_id = m5.meter_id
          AND mpt.period_type = 'day'
          AND mpt.period_start::date = m5.bucket::date
      )
    GROUP BY m5.meter_id, m5.bucket::date
  )
  SELECT a.meter_id, a.day, a.bezug, a.einspeisung FROM archived a
  UNION ALL
  SELECT f.meter_id, f.day, f.bezug, f.einspeisung FROM fallback f
  ORDER BY 2;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.get_meter_daily_totals_split_with_fallback(uuid[], date, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_meter_daily_totals_split_with_fallback(uuid[], date, date) TO authenticated;