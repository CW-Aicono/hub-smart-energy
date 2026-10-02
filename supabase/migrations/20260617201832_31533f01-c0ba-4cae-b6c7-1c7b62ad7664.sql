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
  WITH archived AS (
    -- Verifizierte Tageswerte (alle Loxone-Varianten ausser live, CSV-Verified,
    -- Manuelle Eintraege, MSCONS-Importe) fuer ABGESCHLOSSENE Tage
    SELECT p.meter_id,
           p.period_start AS day,
           CASE WHEN p.total_value >= 0 THEN p.total_value ELSE 0 END::double precision AS bezug,
           CASE WHEN p.total_value <  0 THEN ABS(p.total_value) ELSE 0 END::double precision AS einspeisung,
           'archived'::text AS source
    FROM public.meter_period_totals p
    WHERE p.tenant_id = v_tenant_id
      AND p.meter_id = ANY(p_meter_ids)
      AND p.period_type = 'day'
      AND (
        p.source IN ('loxone','loxone_backfill','manual','smart_meter_mscons','csv_verified','loxone_csv_verified')
        OR p.source LIKE 'loxone_repaired%'
        OR p.source LIKE 'loxone_csv%'
      )
      AND p.source <> 'loxone_live'
      AND p.period_start BETWEEN p_from_date AND LEAST(p_to_date, (now() AT TIME ZONE 'Europe/Berlin')::date - 1)
  ),
  live_today AS (
    SELECT p.meter_id,
           p.period_start AS day,
           CASE WHEN p.total_value >= 0 THEN p.total_value ELSE 0 END::double precision AS bezug,
           CASE WHEN p.total_value <  0 THEN ABS(p.total_value) ELSE 0 END::double precision AS einspeisung,
           'loxone_live'::text AS source
    FROM public.meter_period_totals p
    WHERE p.tenant_id = v_tenant_id
      AND p.meter_id = ANY(p_meter_ids)
      AND p.period_type = 'day'
      AND p.source = 'loxone_live'
      AND p.period_start = (now() AT TIME ZONE 'Europe/Berlin')::date
      AND (now() AT TIME ZONE 'Europe/Berlin')::date BETWEEN p_from_date AND p_to_date
  ),
  five_min_today AS (
    SELECT m5.meter_id,
           ((now() AT TIME ZONE 'Europe/Berlin')::date) AS day,
           COALESCE(SUM(CASE WHEN m5.power_avg >= 0 THEN m5.power_avg * (m5.resolution_minutes/60.0) ELSE 0 END),0)::double precision AS bezug,
           COALESCE(SUM(CASE WHEN m5.power_avg <  0 THEN ABS(m5.power_avg) * (m5.resolution_minutes/60.0) ELSE 0 END),0)::double precision AS einspeisung,
           'today_running'::text AS source
    FROM public.meter_power_readings_5min m5
    WHERE m5.tenant_id = v_tenant_id
      AND m5.meter_id = ANY(p_meter_ids)
      AND m5.bucket >= ((now() AT TIME ZONE 'Europe/Berlin')::date::timestamp AT TIME ZONE 'Europe/Berlin')
      AND m5.bucket <  (((now() AT TIME ZONE 'Europe/Berlin')::date + 1)::timestamp AT TIME ZONE 'Europe/Berlin')
      AND (now() AT TIME ZONE 'Europe/Berlin')::date BETWEEN p_from_date AND p_to_date
      AND NOT EXISTS (SELECT 1 FROM live_today lt WHERE lt.meter_id = m5.meter_id)
    GROUP BY m5.meter_id
  )
  SELECT a.meter_id, a.day, a.bezug, a.einspeisung, a.source FROM archived a
  UNION ALL
  SELECT l.meter_id, l.day, l.bezug, l.einspeisung, l.source FROM live_today l
  UNION ALL
  SELECT f.meter_id, f.day, f.bezug, f.einspeisung, f.source FROM five_min_today f
  ORDER BY 2;
END;
$function$;