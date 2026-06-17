-- Optimierte Variante: aggregiert 5-Minuten-Werte ZUERST nach (meter,day) und macht
-- danach erst den Anti-Join gegen archivierte Tageswerte. Damit fällt der teure
-- NOT EXISTS / Cross-Join über Rohzeilen weg.

CREATE OR REPLACE FUNCTION public.get_meter_period_sums_with_fallback(
  p_meter_ids uuid[],
  p_from_date date,
  p_to_date date
)
RETURNS TABLE(meter_id uuid, total_value double precision)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_tenant_id uuid;
  v_to_date date;
BEGIN
  v_tenant_id := public.get_user_tenant_id();

  IF v_tenant_id IS NULL OR p_meter_ids IS NULL OR array_length(p_meter_ids, 1) IS NULL THEN
    RETURN;
  END IF;

  -- Aktueller Tag wird vom Client über Live-Werte ergänzt → 5-Min Fallback überspringen
  v_to_date := LEAST(p_to_date, CURRENT_DATE - 1);

  RETURN QUERY
  WITH archived AS (
    SELECT
      mpt.meter_id,
      mpt.period_start AS day,
      ABS(mpt.total_value)::double precision AS val
    FROM public.meter_period_totals mpt
    WHERE mpt.tenant_id = v_tenant_id
      AND mpt.meter_id = ANY(p_meter_ids)
      AND mpt.period_type = 'day'
      AND mpt.period_start BETWEEN p_from_date AND v_to_date
  ),
  fallback_agg AS (
    SELECT
      m5.meter_id,
      m5.bucket::date AS day,
      SUM(ABS(m5.power_avg::double precision) * (5.0/60.0))::double precision AS val
    FROM public.meter_power_readings_5min m5
    WHERE m5.tenant_id = v_tenant_id
      AND m5.meter_id = ANY(p_meter_ids)
      AND m5.bucket >= p_from_date::timestamptz
      AND m5.bucket < (v_to_date + 1)::timestamptz
    GROUP BY m5.meter_id, m5.bucket::date
  ),
  fallback_only AS (
    SELECT f.meter_id, f.day, f.val
    FROM fallback_agg f
    WHERE NOT EXISTS (
      SELECT 1 FROM archived a
      WHERE a.meter_id = f.meter_id AND a.day = f.day
    )
  ),
  combined AS (
    SELECT a.meter_id, a.val FROM archived a
    UNION ALL
    SELECT f.meter_id, f.val FROM fallback_only f
    UNION ALL
    -- Heutiger Tag nur aus archivierten Werten (Live ergänzt der Client)
    SELECT mpt.meter_id, ABS(mpt.total_value)::double precision
    FROM public.meter_period_totals mpt
    WHERE p_to_date >= CURRENT_DATE
      AND mpt.tenant_id = v_tenant_id
      AND mpt.meter_id = ANY(p_meter_ids)
      AND mpt.period_type = 'day'
      AND mpt.period_start BETWEEN GREATEST(p_from_date, CURRENT_DATE) AND p_to_date
  )
  SELECT c.meter_id, SUM(c.val)::double precision AS total_value
  FROM combined c
  GROUP BY c.meter_id
  HAVING SUM(c.val) <> 0;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.get_meter_period_sums_with_fallback(uuid[], date, date) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_meter_period_sums_with_fallback(uuid[], date, date) TO authenticated;

-- Gleiche Optimierung für die Tages-Split-Funktion (Chart Jahres-/Monatsansicht)
CREATE OR REPLACE FUNCTION public.get_meter_daily_totals_split_with_fallback(
  p_meter_ids uuid[],
  p_from_date date,
  p_to_date date
)
RETURNS TABLE(meter_id uuid, day date, bezug double precision, einspeisung double precision)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
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
  WITH archived AS (
    SELECT
      mpt.meter_id,
      mpt.period_start::date AS day,
      CASE WHEN mpt.total_value >= 0 THEN mpt.total_value::double precision ELSE 0 END AS bezug,
      CASE WHEN mpt.total_value < 0 THEN ABS(mpt.total_value)::double precision ELSE 0 END AS einspeisung
    FROM public.meter_period_totals mpt
    WHERE mpt.tenant_id = v_tenant_id
      AND mpt.meter_id = ANY(p_meter_ids)
      AND mpt.period_type = 'day'
      AND mpt.period_start::date BETWEEN p_from_date AND p_to_date
  ),
  fallback_agg AS (
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
    GROUP BY m5.meter_id, m5.bucket::date
  ),
  fallback_only AS (
    SELECT f.meter_id, f.day, f.bezug, f.einspeisung
    FROM fallback_agg f
    WHERE NOT EXISTS (
      SELECT 1 FROM archived a
      WHERE a.meter_id = f.meter_id AND a.day = f.day
    )
  )
  SELECT a.meter_id, a.day, a.bezug, a.einspeisung FROM archived a
  UNION ALL
  SELECT f.meter_id, f.day, f.bezug, f.einspeisung FROM fallback_only f
  ORDER BY 2;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.get_meter_daily_totals_split_with_fallback(uuid[], date, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_meter_daily_totals_split_with_fallback(uuid[], date, date) TO authenticated;