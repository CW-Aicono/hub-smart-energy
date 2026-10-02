-- Step 2: RPC bevorzugt für HEUTE den Loxone-Live-Tageswert
DROP FUNCTION IF EXISTS public.get_meter_daily_totals_split_with_fallback(uuid[], date, date);

CREATE OR REPLACE FUNCTION public.get_meter_daily_totals_split_with_fallback(
  p_meter_ids uuid[], p_from_date date, p_to_date date
)
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
    -- Verifizierte Tageswerte aus Loxone (totalDayLast) für ABGESCHLOSSENE Tage
    SELECT p.meter_id,
           p.period_start AS day,
           CASE WHEN p.total_value >= 0 THEN p.total_value ELSE 0 END::double precision AS bezug,
           CASE WHEN p.total_value <  0 THEN ABS(p.total_value) ELSE 0 END::double precision AS einspeisung,
           'archived'::text AS source
    FROM public.meter_period_totals p
    WHERE p.tenant_id = v_tenant_id
      AND p.meter_id = ANY(p_meter_ids)
      AND p.period_type = 'day'
      AND p.source IN ('loxone','loxone_backfill','manual','smart_meter_mscons')
      AND p.period_start BETWEEN p_from_date AND LEAST(p_to_date, (now() AT TIME ZONE 'Europe/Berlin')::date - 1)
  ),
  live_today AS (
    -- Laufender Tageswert (totalDay) aus Loxone für HEUTE
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
    -- 5-Minuten-Fallback NUR wenn kein Loxone-Live für heute existiert
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
      AND NOT EXISTS (
        SELECT 1 FROM live_today lt
        WHERE lt.meter_id = m5.meter_id
      )
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

-- Diagnose-RPC: nebeneinander archived/live/5min für Tage anzeigen
DROP FUNCTION IF EXISTS public.diagnose_meter_daily_values(uuid[], date, date);

CREATE OR REPLACE FUNCTION public.diagnose_meter_daily_values(
  p_meter_ids uuid[], p_from_date date, p_to_date date
)
RETURNS TABLE(
  meter_id uuid,
  day date,
  archived_kwh numeric,
  archived_source text,
  live_kwh numeric,
  five_min_kwh numeric,
  status text
)
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
  WITH days AS (
    SELECT generate_series(p_from_date, p_to_date, INTERVAL '1 day')::date AS day
  ),
  m AS (
    SELECT UNNEST(p_meter_ids) AS meter_id
  ),
  grid AS (
    SELECT m.meter_id, d.day FROM m CROSS JOIN days d
  ),
  arch AS (
    SELECT meter_id, period_start::date AS day,
           SUM(total_value)::numeric AS kwh,
           STRING_AGG(DISTINCT source, ',') AS src
    FROM public.meter_period_totals
    WHERE tenant_id = v_tenant_id
      AND meter_id = ANY(p_meter_ids)
      AND period_type = 'day'
      AND source IN ('loxone','loxone_backfill','manual','smart_meter_mscons')
      AND period_start BETWEEN p_from_date AND p_to_date
    GROUP BY meter_id, period_start
  ),
  live AS (
    SELECT meter_id, period_start::date AS day, total_value::numeric AS kwh
    FROM public.meter_period_totals
    WHERE tenant_id = v_tenant_id
      AND meter_id = ANY(p_meter_ids)
      AND period_type = 'day'
      AND source = 'loxone_live'
      AND period_start BETWEEN p_from_date AND p_to_date
  ),
  fm AS (
    SELECT m5.meter_id,
           (m5.bucket AT TIME ZONE 'Europe/Berlin')::date AS day,
           SUM(GREATEST(m5.power_avg,0) * (m5.resolution_minutes/60.0))::numeric AS kwh
    FROM public.meter_power_readings_5min m5
    WHERE m5.tenant_id = v_tenant_id
      AND m5.meter_id = ANY(p_meter_ids)
      AND m5.bucket >= (p_from_date::timestamp AT TIME ZONE 'Europe/Berlin')
      AND m5.bucket <  ((p_to_date + 1)::timestamp AT TIME ZONE 'Europe/Berlin')
    GROUP BY m5.meter_id, (m5.bucket AT TIME ZONE 'Europe/Berlin')::date
  )
  SELECT g.meter_id,
         g.day,
         ROUND(a.kwh, 3) AS archived_kwh,
         a.src AS archived_source,
         ROUND(l.kwh, 3) AS live_kwh,
         ROUND(f.kwh, 3) AS five_min_kwh,
         CASE
           WHEN g.day = (now() AT TIME ZONE 'Europe/Berlin')::date THEN
             CASE WHEN l.kwh IS NOT NULL THEN 'today_live'
                  WHEN f.kwh IS NOT NULL THEN 'today_fallback'
                  ELSE 'today_missing' END
           WHEN a.kwh IS NULL AND f.kwh IS NULL THEN 'missing'
           WHEN a.kwh IS NULL AND f.kwh IS NOT NULL THEN 'fallback_only'
           WHEN a.kwh IS NOT NULL AND f.kwh IS NOT NULL AND f.kwh > 0
                AND ABS(a.kwh - f.kwh) / GREATEST(a.kwh, f.kwh) < 0.05 THEN 'ok'
           WHEN a.kwh IS NOT NULL AND f.kwh IS NOT NULL THEN 'mismatch'
           ELSE 'archived_only'
         END AS status
  FROM grid g
  LEFT JOIN arch a ON a.meter_id = g.meter_id AND a.day = g.day
  LEFT JOIN live l ON l.meter_id = g.meter_id AND l.day = g.day
  LEFT JOIN fm   f ON f.meter_id = g.meter_id AND f.day = g.day
  ORDER BY g.day, g.meter_id;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.diagnose_meter_daily_values(uuid[], date, date) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_meter_daily_totals_split_with_fallback(uuid[], date, date) TO authenticated, service_role;

-- refresh_meter_daily_totals: loxone_live nicht als 'archived' speichern,
-- und beim Neuaufbau der MV nicht überschreiben mit Fallback.
CREATE OR REPLACE FUNCTION public.refresh_meter_daily_totals(
  p_from date, p_to date, p_tenant_id uuid DEFAULT NULL::uuid, p_meter_ids uuid[] DEFAULT NULL::uuid[]
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_rows integer := 0;
  v_deleted integer := 0;
BEGIN
  -- 1) veraltete archived-Zeilen entfernen
  WITH stale AS (
    SELECT mv.id
    FROM public.meter_daily_totals_mv mv
    WHERE mv.source IN ('archived','today_running')
      AND mv.bucket_start BETWEEN p_from AND p_to
      AND (p_tenant_id IS NULL OR mv.tenant_id = p_tenant_id)
      AND (p_meter_ids IS NULL OR mv.meter_id = ANY(p_meter_ids))
      AND NOT EXISTS (
        SELECT 1 FROM public.meter_period_totals mpt
        WHERE mpt.period_type = 'day'
          AND mpt.meter_id = mv.meter_id
          AND mpt.period_start = mv.bucket_start
          AND mpt.source IN ('loxone','loxone_backfill','loxone_live','manual','smart_meter_mscons')
      )
  )
  DELETE FROM public.meter_daily_totals_mv x USING stale s WHERE x.id = s.id;
  GET DIAGNOSTICS v_deleted = ROW_COUNT;

  -- 2) Upsert: archived (loxone/backfill/manual/mscons), live (loxone_live → today_running), sonst fb
  WITH archived AS (
    SELECT mpt.tenant_id, mpt.meter_id, mpt.energy_type,
           mpt.period_start::date AS day,
           CASE WHEN mpt.total_value >= 0 THEN mpt.total_value ELSE 0 END AS consumption_kwh,
           CASE WHEN mpt.total_value < 0 THEN ABS(mpt.total_value) ELSE 0 END AS export_kwh,
           'archived'::text AS source
    FROM public.meter_period_totals mpt
    WHERE mpt.period_type = 'day'
      AND mpt.source IN ('loxone','loxone_backfill','manual','smart_meter_mscons')
      AND mpt.period_start BETWEEN p_from AND p_to
      AND mpt.meter_id IS NOT NULL
      AND (p_tenant_id IS NULL OR mpt.tenant_id = p_tenant_id)
      AND (p_meter_ids IS NULL OR mpt.meter_id = ANY(p_meter_ids))
  ),
  live AS (
    SELECT mpt.tenant_id, mpt.meter_id, mpt.energy_type,
           mpt.period_start::date AS day,
           CASE WHEN mpt.total_value >= 0 THEN mpt.total_value ELSE 0 END AS consumption_kwh,
           CASE WHEN mpt.total_value < 0 THEN ABS(mpt.total_value) ELSE 0 END AS export_kwh,
           'today_running'::text AS source
    FROM public.meter_period_totals mpt
    WHERE mpt.period_type = 'day'
      AND mpt.source = 'loxone_live'
      AND mpt.period_start BETWEEN p_from AND p_to
      AND mpt.meter_id IS NOT NULL
      AND (p_tenant_id IS NULL OR mpt.tenant_id = p_tenant_id)
      AND (p_meter_ids IS NULL OR mpt.meter_id = ANY(p_meter_ids))
  ),
  fb AS (
    SELECT m5.tenant_id, m5.meter_id, m5.energy_type,
           (m5.bucket AT TIME ZONE 'Europe/Berlin')::date AS day,
           COALESCE(SUM(CASE WHEN m5.power_avg >= 0 THEN m5.power_avg * (m5.resolution_minutes/60.0) ELSE 0 END), 0) AS consumption_kwh,
           COALESCE(SUM(CASE WHEN m5.power_avg <  0 THEN ABS(m5.power_avg) * (m5.resolution_minutes/60.0) ELSE 0 END), 0) AS export_kwh,
           COUNT(*) AS samples,
           'fallback'::text AS source
    FROM public.meter_power_readings_5min m5
    WHERE m5.bucket >= (p_from::timestamp AT TIME ZONE 'Europe/Berlin')
      AND m5.bucket <  ((p_to + 1)::timestamp AT TIME ZONE 'Europe/Berlin')
      AND (p_tenant_id IS NULL OR m5.tenant_id = p_tenant_id)
      AND (p_meter_ids IS NULL OR m5.meter_id = ANY(p_meter_ids))
    GROUP BY m5.tenant_id, m5.meter_id, m5.energy_type, (m5.bucket AT TIME ZONE 'Europe/Berlin')::date
  ),
  merged AS (
    SELECT tenant_id, meter_id, energy_type, day, consumption_kwh, export_kwh,
           0::int AS samples, 1::numeric AS coverage_ratio, source FROM archived
    UNION ALL
    SELECT l.tenant_id, l.meter_id, l.energy_type, l.day, l.consumption_kwh, l.export_kwh,
           0::int, 1::numeric, l.source
    FROM live l
    WHERE NOT EXISTS (SELECT 1 FROM archived a WHERE a.meter_id = l.meter_id AND a.day = l.day)
    UNION ALL
    SELECT f.tenant_id, f.meter_id, f.energy_type, f.day, f.consumption_kwh, f.export_kwh,
           f.samples::int, LEAST(f.samples / 288.0, 1)::numeric, f.source
    FROM fb f
    WHERE NOT EXISTS (SELECT 1 FROM archived a WHERE a.meter_id = f.meter_id AND a.day = f.day)
      AND NOT EXISTS (SELECT 1 FROM live l WHERE l.meter_id = f.meter_id AND l.day = f.day)
  )
  INSERT INTO public.meter_daily_totals_mv (
    tenant_id, meter_id, energy_type, bucket_start,
    consumption_kwh, export_kwh, samples_count, coverage_ratio, source
  )
  SELECT tenant_id, meter_id, energy_type, day,
         consumption_kwh, export_kwh, samples, coverage_ratio, source
  FROM merged
  ON CONFLICT (meter_id, bucket_start) DO UPDATE
    SET consumption_kwh = EXCLUDED.consumption_kwh,
        export_kwh      = EXCLUDED.export_kwh,
        samples_count   = EXCLUDED.samples_count,
        coverage_ratio  = EXCLUDED.coverage_ratio,
        source          = EXCLUDED.source,
        energy_type     = EXCLUDED.energy_type,
        updated_at      = now();
  GET DIAGNOSTICS v_rows = ROW_COUNT;

  RAISE NOTICE 'refresh_meter_daily_totals: deleted=%, upserted=%', v_deleted, v_rows;
  RETURN v_rows;
END;
$function$;