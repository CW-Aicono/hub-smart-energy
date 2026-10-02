CREATE OR REPLACE FUNCTION public.refresh_meter_daily_totals(p_from date, p_to date, p_tenant_id uuid DEFAULT NULL::uuid, p_meter_ids uuid[] DEFAULT NULL::uuid[])
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_rows integer := 0;
  v_deleted integer := 0;
BEGIN
  -- Step 1: remove stale archived rows whose source no longer exists in meter_period_totals
  -- (handles duplicates deleted / off-by-one shifts performed on the source table)
  WITH stale AS (
    SELECT mv.id
    FROM public.meter_daily_totals_mv mv
    WHERE mv.source = 'archived'
      AND mv.bucket_start BETWEEN p_from AND p_to
      AND (p_tenant_id IS NULL OR mv.tenant_id = p_tenant_id)
      AND (p_meter_ids IS NULL OR mv.meter_id = ANY(p_meter_ids))
      AND NOT EXISTS (
        SELECT 1 FROM public.meter_period_totals mpt
        WHERE mpt.period_type = 'day'
          AND mpt.meter_id = mv.meter_id
          AND mpt.period_start = mv.bucket_start
      )
  )
  DELETE FROM public.meter_daily_totals_mv x
  USING stale s
  WHERE x.id = s.id;
  GET DIAGNOSTICS v_deleted = ROW_COUNT;

  -- Step 2: upsert from cleaned sources
  WITH archived AS (
    SELECT mpt.tenant_id, mpt.meter_id, mpt.energy_type,
           mpt.period_start::date AS day,
           CASE WHEN mpt.total_value >= 0 THEN mpt.total_value ELSE 0 END AS consumption_kwh,
           CASE WHEN mpt.total_value < 0 THEN ABS(mpt.total_value) ELSE 0 END AS export_kwh,
           'archived'::text AS source
    FROM public.meter_period_totals mpt
    WHERE mpt.period_type = 'day'
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
    SELECT a.tenant_id, a.meter_id, a.energy_type, a.day,
           a.consumption_kwh, a.export_kwh,
           0::int AS samples, 1::numeric AS coverage_ratio, a.source
    FROM archived a
    UNION ALL
    SELECT f.tenant_id, f.meter_id, f.energy_type, f.day,
           f.consumption_kwh, f.export_kwh,
           f.samples::int, LEAST(f.samples / 288.0, 1)::numeric AS coverage_ratio, f.source
    FROM fb f
    WHERE NOT EXISTS (SELECT 1 FROM archived a WHERE a.meter_id = f.meter_id AND a.day = f.day)
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