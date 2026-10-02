
-- ============================================================================
-- 1) DAILY AGGREGATION TABLE
-- ============================================================================
CREATE TABLE public.meter_daily_totals_mv (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  meter_id uuid NOT NULL REFERENCES public.meters(id) ON DELETE CASCADE,
  energy_type text NOT NULL,
  bucket_start date NOT NULL,
  consumption_kwh numeric NOT NULL DEFAULT 0,
  export_kwh numeric NOT NULL DEFAULT 0,
  samples_count integer NOT NULL DEFAULT 0,
  coverage_ratio numeric NOT NULL DEFAULT 0,
  source text NOT NULL DEFAULT 'archived',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (meter_id, bucket_start)
);
CREATE INDEX idx_mdtm_tenant_meter_bucket ON public.meter_daily_totals_mv (tenant_id, meter_id, bucket_start);
CREATE INDEX idx_mdtm_bucket ON public.meter_daily_totals_mv (bucket_start);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.meter_daily_totals_mv TO authenticated;
GRANT ALL ON public.meter_daily_totals_mv TO service_role;
ALTER TABLE public.meter_daily_totals_mv ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant users manage daily totals" ON public.meter_daily_totals_mv
  USING (tenant_id = public.get_user_tenant_id());
CREATE POLICY "Partner members read daily totals" ON public.meter_daily_totals_mv
  FOR SELECT TO authenticated
  USING (public.partner_has_tenant_access(auth.uid(), tenant_id));

CREATE TRIGGER update_mdtm_updated_at BEFORE UPDATE ON public.meter_daily_totals_mv
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================================
-- 2) WEEKLY AGGREGATION TABLE (ISO weeks, Mon–Sun)
-- ============================================================================
CREATE TABLE public.meter_weekly_totals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  meter_id uuid NOT NULL REFERENCES public.meters(id) ON DELETE CASCADE,
  energy_type text NOT NULL,
  bucket_start date NOT NULL, -- ISO Monday of the week
  iso_year integer NOT NULL,
  iso_week integer NOT NULL,
  consumption_kwh numeric NOT NULL DEFAULT 0,
  export_kwh numeric NOT NULL DEFAULT 0,
  days_count integer NOT NULL DEFAULT 0,
  coverage_ratio numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (meter_id, bucket_start)
);
CREATE INDEX idx_mwt_tenant_meter_bucket ON public.meter_weekly_totals (tenant_id, meter_id, bucket_start);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.meter_weekly_totals TO authenticated;
GRANT ALL ON public.meter_weekly_totals TO service_role;
ALTER TABLE public.meter_weekly_totals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant users manage weekly totals" ON public.meter_weekly_totals
  USING (tenant_id = public.get_user_tenant_id());
CREATE POLICY "Partner members read weekly totals" ON public.meter_weekly_totals
  FOR SELECT TO authenticated
  USING (public.partner_has_tenant_access(auth.uid(), tenant_id));

CREATE TRIGGER update_mwt_updated_at BEFORE UPDATE ON public.meter_weekly_totals
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================================
-- 3) MONTHLY AGGREGATION TABLE
-- ============================================================================
CREATE TABLE public.meter_monthly_totals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  meter_id uuid NOT NULL REFERENCES public.meters(id) ON DELETE CASCADE,
  energy_type text NOT NULL,
  bucket_start date NOT NULL, -- first day of the month
  consumption_kwh numeric NOT NULL DEFAULT 0,
  export_kwh numeric NOT NULL DEFAULT 0,
  days_count integer NOT NULL DEFAULT 0,
  coverage_ratio numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (meter_id, bucket_start)
);
CREATE INDEX idx_mmt_tenant_meter_bucket ON public.meter_monthly_totals (tenant_id, meter_id, bucket_start);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.meter_monthly_totals TO authenticated;
GRANT ALL ON public.meter_monthly_totals TO service_role;
ALTER TABLE public.meter_monthly_totals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant users manage monthly totals" ON public.meter_monthly_totals
  USING (tenant_id = public.get_user_tenant_id());
CREATE POLICY "Partner members read monthly totals" ON public.meter_monthly_totals
  FOR SELECT TO authenticated
  USING (public.partner_has_tenant_access(auth.uid(), tenant_id));

CREATE TRIGGER update_mmt_updated_at BEFORE UPDATE ON public.meter_monthly_totals
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================================
-- 4) DAILY REFRESH (combines archived meter_period_totals + 5min fallback)
--    Upserts one row per meter / day in [p_from, p_to].
-- ============================================================================
CREATE OR REPLACE FUNCTION public.refresh_meter_daily_totals(
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
BEGIN
  WITH archived AS (
    SELECT
      mpt.tenant_id,
      mpt.meter_id,
      mpt.energy_type,
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
    SELECT
      m5.tenant_id,
      m5.meter_id,
      m5.energy_type,
      (m5.bucket AT TIME ZONE 'Europe/Berlin')::date AS day,
      COALESCE(SUM(CASE WHEN m5.power_avg >= 0 THEN m5.power_avg * (m5.resolution_minutes/60.0) ELSE 0 END), 0) AS consumption_kwh,
      COALESCE(SUM(CASE WHEN m5.power_avg < 0 THEN ABS(m5.power_avg) * (m5.resolution_minutes/60.0) ELSE 0 END), 0) AS export_kwh,
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
    -- prefer archived; otherwise use fallback
    SELECT a.tenant_id, a.meter_id, a.energy_type, a.day,
           a.consumption_kwh, a.export_kwh,
           0::int AS samples,
           1::numeric AS coverage_ratio,
           a.source
    FROM archived a
    UNION ALL
    SELECT f.tenant_id, f.meter_id, f.energy_type, f.day,
           f.consumption_kwh, f.export_kwh,
           f.samples::int,
           LEAST(f.samples / 288.0, 1)::numeric AS coverage_ratio,
           f.source
    FROM fb f
    WHERE NOT EXISTS (
      SELECT 1 FROM archived a
      WHERE a.meter_id = f.meter_id AND a.day = f.day
    )
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
  RETURN v_rows;
END;
$$;

-- ============================================================================
-- 5) WEEKLY REFRESH (from meter_daily_totals_mv)
-- ============================================================================
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
      d.energy_type,
      date_trunc('week', d.bucket_start)::date AS week_start,
      EXTRACT(ISOYEAR FROM d.bucket_start)::int AS iso_year,
      EXTRACT(WEEK FROM d.bucket_start)::int AS iso_week,
      SUM(d.consumption_kwh) AS consumption_kwh,
      SUM(d.export_kwh) AS export_kwh,
      COUNT(*) AS days_count,
      (COUNT(*) / 7.0)::numeric AS coverage_ratio
    FROM public.meter_daily_totals_mv d
    WHERE d.bucket_start BETWEEN v_from AND v_to
      AND (p_tenant_id IS NULL OR d.tenant_id = p_tenant_id)
      AND (p_meter_ids IS NULL OR d.meter_id = ANY(p_meter_ids))
    GROUP BY d.tenant_id, d.meter_id, d.energy_type, week_start, iso_year, iso_week
  )
  INSERT INTO public.meter_weekly_totals (
    tenant_id, meter_id, energy_type, bucket_start, iso_year, iso_week,
    consumption_kwh, export_kwh, days_count, coverage_ratio
  )
  SELECT tenant_id, meter_id, energy_type, week_start, iso_year, iso_week,
         consumption_kwh, export_kwh, days_count, LEAST(coverage_ratio, 1)
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

-- ============================================================================
-- 6) MONTHLY REFRESH (from meter_daily_totals_mv)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.refresh_meter_monthly_totals(
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
  v_from date := date_trunc('month', p_from)::date;
  v_to date := (date_trunc('month', p_to) + interval '1 month - 1 day')::date;
BEGIN
  WITH agg AS (
    SELECT
      d.tenant_id,
      d.meter_id,
      d.energy_type,
      date_trunc('month', d.bucket_start)::date AS month_start,
      SUM(d.consumption_kwh) AS consumption_kwh,
      SUM(d.export_kwh) AS export_kwh,
      COUNT(*) AS days_count
    FROM public.meter_daily_totals_mv d
    WHERE d.bucket_start BETWEEN v_from AND v_to
      AND (p_tenant_id IS NULL OR d.tenant_id = p_tenant_id)
      AND (p_meter_ids IS NULL OR d.meter_id = ANY(p_meter_ids))
    GROUP BY d.tenant_id, d.meter_id, d.energy_type, month_start
  )
  INSERT INTO public.meter_monthly_totals (
    tenant_id, meter_id, energy_type, bucket_start,
    consumption_kwh, export_kwh, days_count, coverage_ratio
  )
  SELECT tenant_id, meter_id, energy_type, month_start,
         consumption_kwh, export_kwh, days_count,
         LEAST(days_count / EXTRACT(DAY FROM (month_start + interval '1 month - 1 day'))::numeric, 1)
  FROM agg
  ON CONFLICT (meter_id, bucket_start) DO UPDATE
    SET consumption_kwh = EXCLUDED.consumption_kwh,
        export_kwh      = EXCLUDED.export_kwh,
        days_count      = EXCLUDED.days_count,
        coverage_ratio  = EXCLUDED.coverage_ratio,
        energy_type     = EXCLUDED.energy_type,
        updated_at      = now();
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  RETURN v_rows;
END;
$$;

-- ============================================================================
-- 7) UNIFIED LOOKUP RPC — picks the best aggregation level automatically
-- ============================================================================
CREATE OR REPLACE FUNCTION public.get_meter_totals_auto(
  p_meter_ids uuid[],
  p_from date,
  p_to date
) RETURNS TABLE (
  meter_id uuid,
  bucket_start date,
  granularity text,
  consumption_kwh numeric,
  export_kwh numeric,
  coverage_ratio numeric
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant_id uuid;
  v_days integer;
BEGIN
  v_tenant_id := public.get_user_tenant_id();
  IF v_tenant_id IS NULL OR p_meter_ids IS NULL OR array_length(p_meter_ids,1) IS NULL THEN
    RETURN;
  END IF;
  v_days := (p_to - p_from) + 1;

  IF v_days <= 1 THEN
    -- single day: aggregate raw 5min into hourly buckets for chart resolution
    RETURN QUERY
      SELECT
        m5.meter_id,
        (date_trunc('hour', m5.bucket AT TIME ZONE 'Europe/Berlin'))::date AS bucket_start,
        'hour'::text AS granularity,
        COALESCE(SUM(CASE WHEN m5.power_avg >= 0 THEN m5.power_avg * (m5.resolution_minutes/60.0) ELSE 0 END),0)::numeric,
        COALESCE(SUM(CASE WHEN m5.power_avg < 0 THEN ABS(m5.power_avg) * (m5.resolution_minutes/60.0) ELSE 0 END),0)::numeric,
        1::numeric
      FROM public.meter_power_readings_5min m5
      WHERE m5.tenant_id = v_tenant_id
        AND m5.meter_id = ANY(p_meter_ids)
        AND m5.bucket >= (p_from::timestamp AT TIME ZONE 'Europe/Berlin')
        AND m5.bucket <  ((p_to + 1)::timestamp AT TIME ZONE 'Europe/Berlin')
      GROUP BY m5.meter_id, (date_trunc('hour', m5.bucket AT TIME ZONE 'Europe/Berlin'))::date
      ORDER BY 2;
  ELSIF v_days <= 31 THEN
    RETURN QUERY
      SELECT d.meter_id, d.bucket_start, 'day'::text,
             d.consumption_kwh, d.export_kwh, d.coverage_ratio
      FROM public.meter_daily_totals_mv d
      WHERE d.tenant_id = v_tenant_id
        AND d.meter_id = ANY(p_meter_ids)
        AND d.bucket_start BETWEEN p_from AND p_to
      ORDER BY 2;
  ELSIF v_days <= 180 THEN
    RETURN QUERY
      SELECT w.meter_id, w.bucket_start, 'week'::text,
             w.consumption_kwh, w.export_kwh, w.coverage_ratio
      FROM public.meter_weekly_totals w
      WHERE w.tenant_id = v_tenant_id
        AND w.meter_id = ANY(p_meter_ids)
        AND w.bucket_start BETWEEN p_from AND p_to
      ORDER BY 2;
  ELSE
    RETURN QUERY
      SELECT mo.meter_id, mo.bucket_start, 'month'::text,
             mo.consumption_kwh, mo.export_kwh, mo.coverage_ratio
      FROM public.meter_monthly_totals mo
      WHERE mo.tenant_id = v_tenant_id
        AND mo.meter_id = ANY(p_meter_ids)
        AND mo.bucket_start BETWEEN date_trunc('month', p_from)::date AND p_to
      ORDER BY 2;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.refresh_meter_daily_totals(date,date,uuid,uuid[]) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.refresh_meter_weekly_totals(date,date,uuid,uuid[]) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.refresh_meter_monthly_totals(date,date,uuid,uuid[]) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_meter_totals_auto(uuid[],date,date) TO authenticated, service_role;
