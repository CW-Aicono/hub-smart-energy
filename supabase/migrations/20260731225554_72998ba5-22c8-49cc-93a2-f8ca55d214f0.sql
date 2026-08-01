DO $cleanup$
DECLARE
  v_orphans bigint := 0;
BEGIN
  UPDATE public.meter_power_readings_5min m5
  SET meter_id = NULL
  WHERE m5.meter_id IS NOT NULL
    AND NOT EXISTS (
      SELECT 1
      FROM public.meters m
      WHERE m.id = m5.meter_id
    );

  GET DIAGNOSTICS v_orphans = ROW_COUNT;
  RAISE NOTICE 'Preflight: % verwaiste 5-Minuten-Zuordnungen auf NULL gesetzt', v_orphans;
END
$cleanup$;

CREATE OR REPLACE FUNCTION public.preserve_detached_5min_history()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
BEGIN
  IF OLD.meter_id IS NULL THEN
    RETURN NULL;
  END IF;
  RETURN OLD;
END;
$function$;

DROP TRIGGER IF EXISTS preserve_detached_5min_history_before_delete
ON public.meter_power_readings_5min;

CREATE TRIGGER preserve_detached_5min_history_before_delete
BEFORE DELETE ON public.meter_power_readings_5min
FOR EACH ROW
EXECUTE FUNCTION public.preserve_detached_5min_history();

CREATE OR REPLACE FUNCTION public.refresh_meter_period_totals_5min(
  p_from date DEFAULT CURRENT_DATE,
  p_to date DEFAULT CURRENT_DATE
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_day_rows integer := 0;
BEGIN
  WITH agg AS (
    SELECT
      m5.tenant_id,
      m5.meter_id,
      MAX(m5.energy_type) AS energy_type,
      (m5.bucket AT TIME ZONE 'Europe/Berlin')::date AS day,
      COALESCE(SUM(m5.power_avg * (m5.resolution_minutes / 60.0)), 0)::numeric AS total_value
    FROM public.meter_power_readings_5min m5
    WHERE m5.bucket >= (p_from::timestamp AT TIME ZONE 'Europe/Berlin')
      AND m5.bucket < ((p_to + 1)::timestamp AT TIME ZONE 'Europe/Berlin')
      AND m5.meter_id IS NOT NULL
      AND EXISTS (
        SELECT 1
        FROM public.meters m
        WHERE m.id = m5.meter_id
      )
    GROUP BY
      m5.tenant_id,
      m5.meter_id,
      (m5.bucket AT TIME ZONE 'Europe/Berlin')::date
  ),
  filtered AS (
    SELECT a.*
    FROM agg a
    WHERE NOT EXISTS (
      SELECT 1
      FROM public.meter_period_totals mpt
      WHERE mpt.period_type = 'day'
        AND mpt.meter_id = a.meter_id
        AND mpt.period_start = a.day
        AND mpt.source IN (
          'loxone',
          'loxone_live',
          'loxone_backfill',
          'manual',
          'smart_meter_mscons'
        )
    )
  ),
  upsert_day AS (
    INSERT INTO public.meter_period_totals AS mpt (
      tenant_id,
      meter_id,
      period_type,
      period_start,
      total_value,
      energy_type,
      source
    )
    SELECT
      tenant_id,
      meter_id,
      'day',
      day,
      total_value,
      energy_type,
      'computed_5min'
    FROM filtered
    ON CONFLICT (meter_id, period_type, period_start)
    DO UPDATE SET
      total_value = EXCLUDED.total_value,
      energy_type = EXCLUDED.energy_type,
      source = 'computed_5min',
      updated_at = now()
    WHERE mpt.source NOT IN (
      'loxone',
      'loxone_live',
      'loxone_backfill',
      'manual',
      'smart_meter_mscons'
    )
      AND (
        mpt.total_value IS DISTINCT FROM EXCLUDED.total_value
        OR mpt.energy_type IS DISTINCT FROM EXCLUDED.energy_type
        OR mpt.source IS DISTINCT FROM 'computed_5min'
      )
    RETURNING 1
  )
  SELECT COUNT(*) INTO v_day_rows FROM upsert_day;

  RETURN v_day_rows;
END;
$function$;