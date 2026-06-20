CREATE OR REPLACE FUNCTION public.refresh_meter_period_totals_5min(p_from date DEFAULT ((CURRENT_DATE - '1 day'::interval))::date, p_to date DEFAULT CURRENT_DATE)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_day_rows integer := 0;
  v_month_rows integer := 0;
  v_year_rows integer := 0;
BEGIN
  -- 1) Tagessummen aus 5-Min-Buckets aggregieren.
  --    Nicht überschreiben, wenn schon eine autoritative Quelle existiert
  --    (Loxone-Backfill aus Statistik-API, manuelle Ablesungen, Smart-Meter-MSCONS-Import).
  --    'loxone_live' (altes Polling, jetzt abgeschaltet) wird ersetzt.
  WITH agg AS (
    SELECT
      m5.tenant_id,
      m5.meter_id,
      m5.energy_type,
      (m5.bucket AT TIME ZONE 'Europe/Berlin')::date AS day,
      COALESCE(SUM(m5.power_avg * (m5.resolution_minutes / 60.0)), 0)::numeric AS total_value
    FROM public.meter_power_readings_5min m5
    WHERE m5.bucket >= (p_from::timestamp AT TIME ZONE 'Europe/Berlin')
      AND m5.bucket <  ((p_to + 1)::timestamp AT TIME ZONE 'Europe/Berlin')
    GROUP BY m5.tenant_id, m5.meter_id, m5.energy_type,
             (m5.bucket AT TIME ZONE 'Europe/Berlin')::date
  ),
  filtered AS (
    SELECT a.*
    FROM agg a
    WHERE NOT EXISTS (
      SELECT 1 FROM public.meter_period_totals mpt
      WHERE mpt.period_type = 'day'
        AND mpt.meter_id = a.meter_id
        AND mpt.period_start = a.day
        AND mpt.source IN ('loxone','loxone_backfill','manual','smart_meter_mscons')
    )
  ),
  upsert_day AS (
    INSERT INTO public.meter_period_totals AS mpt (
      tenant_id, meter_id, period_type, period_start,
      total_value, energy_type, source
    )
    SELECT tenant_id, meter_id, 'day', day, total_value, energy_type, 'computed_5min'
    FROM filtered
    ON CONFLICT (meter_id, period_type, period_start)
    DO UPDATE SET
      total_value = EXCLUDED.total_value,
      energy_type = EXCLUDED.energy_type,
      source      = 'computed_5min',
      updated_at  = now()
    WHERE mpt.source NOT IN ('loxone','loxone_backfill','manual','smart_meter_mscons')
    RETURNING 1
  )
  SELECT COUNT(*) INTO v_day_rows FROM upsert_day;

  -- 2) Monatssummen aus den Tageszeilen aggregieren (für die betroffenen Monate).
  WITH months AS (
    SELECT DISTINCT
      tenant_id, meter_id, energy_type,
      date_trunc('month', period_start)::date AS month_start
    FROM public.meter_period_totals
    WHERE period_type = 'day'
      AND period_start BETWEEN p_from AND p_to
  ),
  month_agg AS (
    SELECT
      mpt.tenant_id,
      mpt.meter_id,
      mpt.energy_type,
      date_trunc('month', mpt.period_start)::date AS month_start,
      SUM(mpt.total_value)::numeric AS total_value
    FROM public.meter_period_totals mpt
    WHERE mpt.period_type = 'day'
      AND (mpt.meter_id, date_trunc('month', mpt.period_start)::date) IN (
        SELECT meter_id, month_start FROM months
      )
    GROUP BY mpt.tenant_id, mpt.meter_id, mpt.energy_type,
             date_trunc('month', mpt.period_start)::date
  ),
  upsert_month AS (
    INSERT INTO public.meter_period_totals AS mpt (
      tenant_id, meter_id, period_type, period_start,
      total_value, energy_type, source
    )
    SELECT tenant_id, meter_id, 'month', month_start, total_value, energy_type, 'computed_5min'
    FROM month_agg
    ON CONFLICT (meter_id, period_type, period_start)
    DO UPDATE SET
      total_value = EXCLUDED.total_value,
      energy_type = EXCLUDED.energy_type,
      source      = 'computed_5min',
      updated_at  = now()
    WHERE mpt.source NOT IN ('manual','smart_meter_mscons')
    RETURNING 1
  )
  SELECT COUNT(*) INTO v_month_rows FROM upsert_month;

  -- 3) Jahressummen aus den Tageszeilen aggregieren (für die betroffenen Jahre).
  WITH years AS (
    SELECT DISTINCT
      tenant_id, meter_id, energy_type,
      date_trunc('year', period_start)::date AS year_start
    FROM public.meter_period_totals
    WHERE period_type = 'day'
      AND period_start BETWEEN p_from AND p_to
  ),
  year_agg AS (
    SELECT
      mpt.tenant_id,
      mpt.meter_id,
      mpt.energy_type,
      date_trunc('year', mpt.period_start)::date AS year_start,
      SUM(mpt.total_value)::numeric AS total_value
    FROM public.meter_period_totals mpt
    WHERE mpt.period_type = 'day'
      AND (mpt.meter_id, date_trunc('year', mpt.period_start)::date) IN (
        SELECT meter_id, year_start FROM years
      )
    GROUP BY mpt.tenant_id, mpt.meter_id, mpt.energy_type,
             date_trunc('year', mpt.period_start)::date
  ),
  upsert_year AS (
    INSERT INTO public.meter_period_totals AS mpt (
      tenant_id, meter_id, period_type, period_start,
      total_value, energy_type, source
    )
    SELECT tenant_id, meter_id, 'year', year_start, total_value, energy_type, 'computed_5min'
    FROM year_agg
    ON CONFLICT (meter_id, period_type, period_start)
    DO UPDATE SET
      total_value = EXCLUDED.total_value,
      energy_type = EXCLUDED.energy_type,
      source      = 'computed_5min',
      updated_at  = now()
    WHERE mpt.source NOT IN ('manual','smart_meter_mscons')
    RETURNING 1
  )
  SELECT COUNT(*) INTO v_year_rows FROM upsert_year;

  RETURN v_day_rows + v_month_rows + v_year_rows;
END;
$function$;