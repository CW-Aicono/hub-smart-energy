
CREATE OR REPLACE FUNCTION public.refresh_meter_weekly_totals(
  p_from date,
  p_to date,
  p_tenant_id uuid DEFAULT NULL,
  p_meter_ids uuid[] DEFAULT NULL
) RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rows integer := 0;
  v_from date := date_trunc('week', p_from)::date;
  v_to date := (date_trunc('week', p_to) + interval '6 day')::date;
BEGIN
  WITH agg AS (
    SELECT
      d.tenant_id,
      d.meter_id,
      MAX(d.energy_type) AS energy_type,
      date_trunc('week', d.bucket_start)::date AS week_start,
      SUM(d.consumption_kwh) AS consumption_kwh,
      SUM(d.export_kwh) AS export_kwh,
      COUNT(*) AS days_count
    FROM public.meter_daily_totals_mv d
    WHERE d.bucket_start BETWEEN v_from AND v_to
      AND (p_tenant_id IS NULL OR d.tenant_id = p_tenant_id)
      AND (p_meter_ids IS NULL OR d.meter_id = ANY(p_meter_ids))
    GROUP BY d.tenant_id, d.meter_id, date_trunc('week', d.bucket_start)::date
  )
  INSERT INTO public.meter_weekly_totals (
    tenant_id, meter_id, energy_type, bucket_start, iso_year, iso_week,
    consumption_kwh, export_kwh, days_count, coverage_ratio
  )
  SELECT
    tenant_id, meter_id, energy_type, week_start,
    EXTRACT(ISOYEAR FROM week_start)::int,
    EXTRACT(WEEK FROM week_start)::int,
    consumption_kwh, export_kwh, days_count,
    LEAST(days_count / 7.0, 1)::numeric
  FROM agg
  ON CONFLICT (meter_id, bucket_start) DO UPDATE
    SET consumption_kwh = EXCLUDED.consumption_kwh,
        export_kwh      = EXCLUDED.export_kwh,
        days_count      = EXCLUDED.days_count,
        coverage_ratio  = EXCLUDED.coverage_ratio,
        iso_year        = EXCLUDED.iso_year,
        iso_week        = EXCLUDED.iso_week,
        energy_type     = EXCLUDED.energy_type,
        updated_at      = now();
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  RETURN v_rows;
END;
$$;
