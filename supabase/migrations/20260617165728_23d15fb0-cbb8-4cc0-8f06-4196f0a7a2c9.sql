-- Reconcile-View: vergleicht Loxone-Tagessummen mit aus 5-Min integrierten kWh.
CREATE OR REPLACE VIEW public.meter_data_quality_v AS
WITH days AS (
  SELECT DISTINCT
    mpt.tenant_id,
    mpt.meter_id,
    mpt.period_start AS day
  FROM public.meter_period_totals mpt
  WHERE mpt.period_type = 'day'
  UNION
  SELECT DISTINCT
    m5.tenant_id,
    m5.meter_id,
    (m5.bucket AT TIME ZONE 'Europe/Berlin')::date AS day
  FROM public.meter_power_readings_5min m5
),
lox AS (
  SELECT
    mpt.tenant_id,
    mpt.meter_id,
    mpt.period_start AS day,
    mpt.total_value::numeric AS loxone_kwh,
    mpt.source        AS loxone_source,
    mpt.updated_at    AS loxone_updated_at
  FROM public.meter_period_totals mpt
  WHERE mpt.period_type = 'day'
),
five AS (
  SELECT
    m5.tenant_id,
    m5.meter_id,
    (m5.bucket AT TIME ZONE 'Europe/Berlin')::date AS day,
    SUM(m5.power_avg * (m5.resolution_minutes / 60.0))::numeric AS five_min_kwh,
    SUM(CASE WHEN m5.power_avg >= 0 THEN  m5.power_avg ELSE 0 END
        * (m5.resolution_minutes / 60.0))::numeric AS five_min_bezug_kwh,
    SUM(CASE WHEN m5.power_avg < 0  THEN -m5.power_avg ELSE 0 END
        * (m5.resolution_minutes / 60.0))::numeric AS five_min_einspeisung_kwh,
    SUM(m5.sample_count)::integer AS five_min_sample_count,
    LEAST(COUNT(*)::numeric / 288.0, 1)::numeric AS five_min_coverage_ratio,
    MAX(m5.bucket) AS five_min_last_bucket
  FROM public.meter_power_readings_5min m5
  GROUP BY m5.tenant_id, m5.meter_id, (m5.bucket AT TIME ZONE 'Europe/Berlin')::date
)
SELECT
  d.tenant_id,
  d.meter_id,
  d.day,
  lox.loxone_kwh,
  lox.loxone_source,
  lox.loxone_updated_at,
  five.five_min_kwh,
  five.five_min_bezug_kwh,
  five.five_min_einspeisung_kwh,
  five.five_min_sample_count,
  COALESCE(five.five_min_coverage_ratio, 0)::numeric AS five_min_coverage_ratio,
  five.five_min_last_bucket,
  (lox.loxone_kwh - five.five_min_kwh)::numeric AS delta_kwh,
  CASE
    WHEN lox.loxone_kwh IS NULL OR five.five_min_kwh IS NULL
      OR ABS(lox.loxone_kwh) < 0.01 THEN NULL
    ELSE ROUND(((lox.loxone_kwh - five.five_min_kwh) / NULLIF(lox.loxone_kwh, 0) * 100)::numeric, 2)
  END AS delta_pct,
  CASE
    WHEN lox.loxone_kwh IS NULL AND COALESCE(five.five_min_coverage_ratio, 0) < 0.05 THEN 'gap'
    WHEN lox.loxone_kwh IS NULL THEN 'missing_loxone'
    WHEN five.five_min_kwh IS NULL OR COALESCE(five.five_min_coverage_ratio, 0) < 0.5 THEN 'missing_5min'
    WHEN ABS(lox.loxone_kwh) < 0.01 AND ABS(COALESCE(five.five_min_kwh, 0)) < 0.01 THEN 'ok'
    WHEN ABS(((lox.loxone_kwh - five.five_min_kwh) / NULLIF(lox.loxone_kwh, 0)) * 100) <= 5
      AND COALESCE(five.five_min_coverage_ratio, 0) >= 0.95 THEN 'ok'
    WHEN ABS(((lox.loxone_kwh - five.five_min_kwh) / NULLIF(lox.loxone_kwh, 0)) * 100) <= 15 THEN 'tolerance'
    ELSE 'mismatch'
  END AS status
FROM days d
LEFT JOIN lox  ON lox.tenant_id  = d.tenant_id AND lox.meter_id  = d.meter_id AND lox.day  = d.day
LEFT JOIN five ON five.tenant_id = d.tenant_id AND five.meter_id = d.meter_id AND five.day = d.day;

-- Rechte auf den View (Views erben RLS der Basistabellen)
GRANT SELECT ON public.meter_data_quality_v TO authenticated;
GRANT SELECT ON public.meter_data_quality_v TO service_role;

-- RPC für gefilterten Zugriff aus dem Frontend
CREATE OR REPLACE FUNCTION public.get_meter_daily_status(
  p_meter_ids uuid[],
  p_from_date date,
  p_to_date   date
)
RETURNS TABLE(
  meter_id uuid,
  day date,
  loxone_kwh numeric,
  loxone_source text,
  five_min_kwh numeric,
  five_min_coverage_ratio numeric,
  five_min_last_bucket timestamptz,
  delta_kwh numeric,
  delta_pct numeric,
  status text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    v.meter_id, v.day, v.loxone_kwh, v.loxone_source,
    v.five_min_kwh, v.five_min_coverage_ratio, v.five_min_last_bucket,
    v.delta_kwh, v.delta_pct, v.status
  FROM public.meter_data_quality_v v
  WHERE v.meter_id = ANY(p_meter_ids)
    AND v.day >= p_from_date
    AND v.day <= p_to_date
    AND (
      public.has_role(auth.uid(), 'super_admin'::public.app_role)
      OR v.tenant_id = public.get_user_tenant_id()
    )
  ORDER BY v.meter_id, v.day;
$$;

GRANT EXECUTE ON FUNCTION public.get_meter_daily_status(uuid[], date, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_meter_daily_status(uuid[], date, date) TO service_role;