
-- Replace daily-split RPC: read from pre-aggregated meter_daily_totals_mv.
-- For "today" we add an on-the-fly aggregation from 5min readings (since the
-- nightly cron has not produced today's row yet).
CREATE OR REPLACE FUNCTION public.get_meter_daily_totals_split_with_fallback(
  p_meter_ids uuid[], p_from_date date, p_to_date date
) RETURNS TABLE(meter_id uuid, day date, bezug double precision, einspeisung double precision)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $function$
DECLARE
  v_tenant_id uuid;
BEGIN
  v_tenant_id := public.get_user_tenant_id();
  IF v_tenant_id IS NULL OR p_meter_ids IS NULL OR array_length(p_meter_ids,1) IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  WITH pre AS (
    SELECT d.meter_id, d.bucket_start AS day,
           d.consumption_kwh::double precision AS bezug,
           d.export_kwh::double precision AS einspeisung
    FROM public.meter_daily_totals_mv d
    WHERE d.tenant_id = v_tenant_id
      AND d.meter_id = ANY(p_meter_ids)
      AND d.bucket_start BETWEEN p_from_date AND LEAST(p_to_date, CURRENT_DATE - 1)
  ),
  today_fb AS (
    SELECT m5.meter_id, CURRENT_DATE AS day,
      COALESCE(SUM(CASE WHEN m5.power_avg >= 0 THEN m5.power_avg * (m5.resolution_minutes/60.0) ELSE 0 END),0)::double precision AS bezug,
      COALESCE(SUM(CASE WHEN m5.power_avg <  0 THEN ABS(m5.power_avg) * (m5.resolution_minutes/60.0) ELSE 0 END),0)::double precision AS einspeisung
    FROM public.meter_power_readings_5min m5
    WHERE m5.tenant_id = v_tenant_id
      AND m5.meter_id = ANY(p_meter_ids)
      AND m5.bucket >= (CURRENT_DATE::timestamp AT TIME ZONE 'Europe/Berlin')
      AND m5.bucket <  ((CURRENT_DATE + 1)::timestamp AT TIME ZONE 'Europe/Berlin')
      AND CURRENT_DATE BETWEEN p_from_date AND p_to_date
    GROUP BY m5.meter_id
  )
  SELECT p.meter_id, p.day, p.bezug, p.einspeisung FROM pre p
  UNION ALL
  SELECT t.meter_id, t.day, t.bezug, t.einspeisung FROM today_fb t
  ORDER BY 2;
END;
$function$;

-- Replace sum RPC: same source, return ABS sum per meter
CREATE OR REPLACE FUNCTION public.get_meter_period_sums_with_fallback(
  p_meter_ids uuid[], p_from_date date, p_to_date date
) RETURNS TABLE(meter_id uuid, total_value double precision)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $function$
DECLARE
  v_tenant_id uuid;
BEGIN
  v_tenant_id := public.get_user_tenant_id();
  IF v_tenant_id IS NULL OR p_meter_ids IS NULL OR array_length(p_meter_ids,1) IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  WITH pre AS (
    SELECT d.meter_id,
           (d.consumption_kwh + d.export_kwh)::double precision AS val
    FROM public.meter_daily_totals_mv d
    WHERE d.tenant_id = v_tenant_id
      AND d.meter_id = ANY(p_meter_ids)
      AND d.bucket_start BETWEEN p_from_date AND LEAST(p_to_date, CURRENT_DATE - 1)
  )
  SELECT pre.meter_id, SUM(pre.val)::double precision
  FROM pre
  GROUP BY pre.meter_id;
END;
$function$;
