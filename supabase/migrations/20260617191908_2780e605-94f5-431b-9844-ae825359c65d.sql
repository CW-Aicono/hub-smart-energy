DROP FUNCTION IF EXISTS public.get_meter_daily_totals_split_with_fallback(uuid[], date, date);

CREATE OR REPLACE FUNCTION public.get_meter_daily_totals_split_with_fallback(p_meter_ids uuid[], p_from_date date, p_to_date date)
 RETURNS TABLE(meter_id uuid, day date, bezug double precision, einspeisung double precision, source text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
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
           d.export_kwh::double precision AS einspeisung,
           d.source::text AS source
    FROM public.meter_daily_totals_mv d
    WHERE d.tenant_id = v_tenant_id
      AND d.meter_id = ANY(p_meter_ids)
      AND d.bucket_start BETWEEN p_from_date AND LEAST(p_to_date, CURRENT_DATE - 1)
  ),
  today_fb AS (
    SELECT m5.meter_id, CURRENT_DATE AS day,
      COALESCE(SUM(CASE WHEN m5.power_avg >= 0 THEN m5.power_avg * (m5.resolution_minutes/60.0) ELSE 0 END),0)::double precision AS bezug,
      COALESCE(SUM(CASE WHEN m5.power_avg <  0 THEN ABS(m5.power_avg) * (m5.resolution_minutes/60.0) ELSE 0 END),0)::double precision AS einspeisung,
      'today_running'::text AS source
    FROM public.meter_power_readings_5min m5
    WHERE m5.tenant_id = v_tenant_id
      AND m5.meter_id = ANY(p_meter_ids)
      AND m5.bucket >= (CURRENT_DATE::timestamp AT TIME ZONE 'Europe/Berlin')
      AND m5.bucket <  ((CURRENT_DATE + 1)::timestamp AT TIME ZONE 'Europe/Berlin')
      AND CURRENT_DATE BETWEEN p_from_date AND p_to_date
    GROUP BY m5.meter_id
  )
  SELECT p.meter_id, p.day, p.bezug, p.einspeisung, p.source FROM pre p
  UNION ALL
  SELECT t.meter_id, t.day, t.bezug, t.einspeisung, t.source FROM today_fb t
  ORDER BY 2;
END;
$function$;