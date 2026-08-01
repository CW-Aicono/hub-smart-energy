DO $cleanup$
DECLARE
  v_orphans bigint := 0;
BEGIN
  UPDATE public.meter_power_readings_5min m5
  SET meter_id = NULL
  WHERE m5.meter_id IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM public.meters m WHERE m.id = m5.meter_id);
  GET DIAGNOSTICS v_orphans = ROW_COUNT;
  RAISE NOTICE 'FK-Preflight: % verwaiste 5-Minuten-Zuordnungen auf NULL gesetzt', v_orphans;
END
$cleanup$;

DO $constraint$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint c
    WHERE c.conrelid = 'public.meter_power_readings_5min'::regclass
      AND c.contype = 'f'
      AND c.confrelid = 'public.meters'::regclass
  ) THEN
    ALTER TABLE public.meter_power_readings_5min
      ADD CONSTRAINT meter_power_readings_5min_meter_id_fkey
      FOREIGN KEY (meter_id) REFERENCES public.meters(id) ON DELETE SET NULL;
  END IF;
END
$constraint$;

CREATE OR REPLACE FUNCTION public.refresh_meter_period_totals_5min(p_from date DEFAULT CURRENT_DATE, p_to date DEFAULT CURRENT_DATE)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_day_rows integer := 0;
BEGIN
  WITH agg AS (
    SELECT m5.tenant_id, m5.meter_id, MAX(m5.energy_type) AS energy_type,
           (m5.bucket AT TIME ZONE 'Europe/Berlin')::date AS day,
           COALESCE(SUM(m5.power_avg * (m5.resolution_minutes / 60.0)), 0)::numeric AS total_value
    FROM public.meter_power_readings_5min m5
    WHERE m5.bucket >= (p_from::timestamp AT TIME ZONE 'Europe/Berlin')
      AND m5.bucket < ((p_to + 1)::timestamp AT TIME ZONE 'Europe/Berlin')
      AND m5.meter_id IS NOT NULL
      AND EXISTS (SELECT 1 FROM public.meters m WHERE m.id = m5.meter_id)
    GROUP BY m5.tenant_id, m5.meter_id, (m5.bucket AT TIME ZONE 'Europe/Berlin')::date
  ), filtered AS (
    SELECT a.* FROM agg a
    WHERE NOT EXISTS (
      SELECT 1 FROM public.meter_period_totals mpt
      WHERE mpt.period_type = 'day' AND mpt.meter_id = a.meter_id
        AND mpt.period_start = a.day
        AND mpt.source IN ('loxone','loxone_live','loxone_backfill','manual','smart_meter_mscons')
    )
  ), upsert_day AS (
    INSERT INTO public.meter_period_totals AS mpt
      (tenant_id, meter_id, period_type, period_start, total_value, energy_type, source)
    SELECT tenant_id, meter_id, 'day', day, total_value, energy_type, 'computed_5min'
    FROM filtered
    ON CONFLICT (meter_id, period_type, period_start) DO UPDATE SET
      total_value = EXCLUDED.total_value,
      energy_type = EXCLUDED.energy_type,
      source = 'computed_5min',
      updated_at = now()
    WHERE mpt.source NOT IN ('loxone','loxone_live','loxone_backfill','manual','smart_meter_mscons')
      AND (mpt.total_value IS DISTINCT FROM EXCLUDED.total_value
        OR mpt.energy_type IS DISTINCT FROM EXCLUDED.energy_type
        OR mpt.source IS DISTINCT FROM 'computed_5min')
    RETURNING 1
  )
  SELECT COUNT(*) INTO v_day_rows FROM upsert_day;
  RETURN v_day_rows;
END;
$function$;

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
  WITH stale AS (
    SELECT mv.id FROM public.meter_daily_totals_mv mv
    WHERE mv.source IN ('archived','today_running')
      AND mv.bucket_start BETWEEN p_from AND p_to
      AND (p_tenant_id IS NULL OR mv.tenant_id = p_tenant_id)
      AND (p_meter_ids IS NULL OR mv.meter_id = ANY(p_meter_ids))
      AND NOT EXISTS (
        SELECT 1 FROM public.meter_period_totals mpt
        WHERE mpt.period_type = 'day' AND mpt.meter_id = mv.meter_id
          AND mpt.period_start = mv.bucket_start
          AND mpt.source IN ('loxone','loxone_backfill','loxone_live','manual','smart_meter_mscons')
      )
  )
  DELETE FROM public.meter_daily_totals_mv x USING stale s WHERE x.id = s.id;
  GET DIAGNOSTICS v_deleted = ROW_COUNT;

  WITH archived AS (
    SELECT mpt.tenant_id, mpt.meter_id, mpt.energy_type, mpt.period_start::date AS day,
           CASE WHEN mpt.total_value >= 0 THEN mpt.total_value ELSE 0 END AS consumption_kwh,
           CASE WHEN mpt.total_value < 0 THEN ABS(mpt.total_value) ELSE 0 END AS export_kwh,
           'archived'::text AS source
    FROM public.meter_period_totals mpt
    WHERE mpt.period_type = 'day'
      AND mpt.source IN ('loxone','loxone_backfill','manual','smart_meter_mscons')
      AND mpt.period_start BETWEEN p_from AND p_to
      AND mpt.meter_id IS NOT NULL
      AND EXISTS (SELECT 1 FROM public.meters m WHERE m.id = mpt.meter_id)
      AND (p_tenant_id IS NULL OR mpt.tenant_id = p_tenant_id)
      AND (p_meter_ids IS NULL OR mpt.meter_id = ANY(p_meter_ids))
  ), live AS (
    SELECT mpt.tenant_id, mpt.meter_id, mpt.energy_type, mpt.period_start::date AS day,
           CASE WHEN mpt.total_value >= 0 THEN mpt.total_value ELSE 0 END AS consumption_kwh,
           CASE WHEN mpt.total_value < 0 THEN ABS(mpt.total_value) ELSE 0 END AS export_kwh,
           'today_running'::text AS source
    FROM public.meter_period_totals mpt
    WHERE mpt.period_type = 'day' AND mpt.source = 'loxone_live'
      AND mpt.period_start BETWEEN p_from AND p_to
      AND mpt.meter_id IS NOT NULL
      AND EXISTS (SELECT 1 FROM public.meters m WHERE m.id = mpt.meter_id)
      AND (p_tenant_id IS NULL OR mpt.tenant_id = p_tenant_id)
      AND (p_meter_ids IS NULL OR mpt.meter_id = ANY(p_meter_ids))
  ), fb AS (
    SELECT m5.tenant_id, m5.meter_id, m5.energy_type,
           (m5.bucket AT TIME ZONE 'Europe/Berlin')::date AS day,
           COALESCE(SUM(CASE WHEN m5.power_avg >= 0 THEN m5.power_avg * (m5.resolution_minutes/60.0) ELSE 0 END), 0) AS consumption_kwh,
           COALESCE(SUM(CASE WHEN m5.power_avg < 0 THEN ABS(m5.power_avg) * (m5.resolution_minutes/60.0) ELSE 0 END), 0) AS export_kwh,
           COUNT(*) AS samples, 'fallback'::text AS source
    FROM public.meter_power_readings_5min m5
    WHERE m5.bucket >= (p_from::timestamp AT TIME ZONE 'Europe/Berlin')
      AND m5.bucket < ((p_to + 1)::timestamp AT TIME ZONE 'Europe/Berlin')
      AND m5.meter_id IS NOT NULL
      AND EXISTS (SELECT 1 FROM public.meters m WHERE m.id = m5.meter_id)
      AND (p_tenant_id IS NULL OR m5.tenant_id = p_tenant_id)
      AND (p_meter_ids IS NULL OR m5.meter_id = ANY(p_meter_ids))
    GROUP BY m5.tenant_id, m5.meter_id, m5.energy_type, (m5.bucket AT TIME ZONE 'Europe/Berlin')::date
  ), merged AS (
    SELECT tenant_id, meter_id, energy_type, day, consumption_kwh, export_kwh,
           0::int AS samples, 1::numeric AS coverage_ratio, source FROM archived
    UNION ALL
    SELECT l.tenant_id, l.meter_id, l.energy_type, l.day, l.consumption_kwh, l.export_kwh,
           0::int, 1::numeric, l.source FROM live l
    WHERE NOT EXISTS (SELECT 1 FROM archived a WHERE a.meter_id = l.meter_id AND a.day = l.day)
    UNION ALL
    SELECT f.tenant_id, f.meter_id, f.energy_type, f.day, f.consumption_kwh, f.export_kwh,
           f.samples::int, LEAST(f.samples / 288.0, 1)::numeric, f.source FROM fb f
    WHERE NOT EXISTS (SELECT 1 FROM archived a WHERE a.meter_id = f.meter_id AND a.day = f.day)
      AND NOT EXISTS (SELECT 1 FROM live l WHERE l.meter_id = f.meter_id AND l.day = f.day)
  )
  INSERT INTO public.meter_daily_totals_mv
    (tenant_id, meter_id, energy_type, bucket_start, consumption_kwh, export_kwh, samples_count, coverage_ratio, source)
  SELECT tenant_id, meter_id, energy_type, day, consumption_kwh, export_kwh, samples, coverage_ratio, source
  FROM merged
  ON CONFLICT (meter_id, bucket_start) DO UPDATE SET
    consumption_kwh = EXCLUDED.consumption_kwh,
    export_kwh = EXCLUDED.export_kwh,
    samples_count = EXCLUDED.samples_count,
    coverage_ratio = EXCLUDED.coverage_ratio,
    source = EXCLUDED.source,
    energy_type = EXCLUDED.energy_type,
    updated_at = now();
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  RAISE NOTICE 'refresh_meter_daily_totals: deleted=%, upserted=%', v_deleted, v_rows;
  RETURN v_rows;
END;
$function$;

REVOKE ALL ON FUNCTION public.refresh_meter_period_totals_5min(date,date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.refresh_meter_period_totals_5min(date,date) TO service_role;
REVOKE ALL ON FUNCTION public.refresh_meter_daily_totals(date,date,uuid,uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.refresh_meter_daily_totals(date,date,uuid,uuid[]) TO authenticated, service_role;