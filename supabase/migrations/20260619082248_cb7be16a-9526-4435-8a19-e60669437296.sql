-- 1) Aggregations-Funktion: 5min -> meter_period_totals (period_type=day, source=computed_5min)
CREATE OR REPLACE FUNCTION public.refresh_meter_period_totals_5min(
  p_from date DEFAULT (CURRENT_DATE - INTERVAL '1 day')::date,
  p_to   date DEFAULT CURRENT_DATE
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_rows integer := 0;
BEGIN
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
  -- nur Zähler/Tage ohne autoritative Quelle aktualisieren
  filtered AS (
    SELECT a.*
    FROM agg a
    WHERE NOT EXISTS (
      SELECT 1 FROM public.meter_period_totals mpt
      WHERE mpt.period_type = 'day'
        AND mpt.meter_id = a.meter_id
        AND mpt.period_start = a.day
        AND mpt.source IN ('loxone','loxone_live','loxone_backfill','manual','smart_meter_mscons')
    )
  ),
  upsert AS (
    INSERT INTO public.meter_period_totals (
      tenant_id, meter_id, period_type, period_start,
      total_value, energy_type, source
    )
    SELECT tenant_id, meter_id, 'day', day, total_value, energy_type, 'computed_5min'
    FROM filtered
    ON CONFLICT (meter_id, period_type, period_start, energy_type, source)
    DO UPDATE SET
      total_value = EXCLUDED.total_value,
      updated_at  = now()
    RETURNING 1
  )
  SELECT COUNT(*) INTO v_rows FROM upsert;

  RETURN v_rows;
END;
$$;

GRANT EXECUTE ON FUNCTION public.refresh_meter_period_totals_5min(date, date) TO service_role;

-- 2) Falls noch kein eindeutiger Index für ON CONFLICT existiert, anlegen
CREATE UNIQUE INDEX IF NOT EXISTS meter_period_totals_unique_key
  ON public.meter_period_totals (meter_id, period_type, period_start, energy_type, source);

-- 3) Cron-Job alle 5 Minuten
SELECT cron.unschedule('refresh-meter-period-totals-5min')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'refresh-meter-period-totals-5min');

SELECT cron.schedule(
  'refresh-meter-period-totals-5min',
  '*/5 * * * *',
  $cron$ SELECT public.refresh_meter_period_totals_5min((CURRENT_DATE - INTERVAL '1 day')::date, CURRENT_DATE); $cron$
);