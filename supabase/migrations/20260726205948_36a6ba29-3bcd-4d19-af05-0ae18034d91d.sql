-- =====================================================================
-- Sensor-Historie: Stunden-/Tages-/Monats-Rollups (zeit-gewichtet)
-- =====================================================================

-- ---------- Hourly ----------
CREATE TABLE public.sensor_readings_hourly (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL,
  meter_id UUID NOT NULL,
  bucket TIMESTAMPTZ NOT NULL,
  value_twavg DOUBLE PRECISION NOT NULL,
  value_min DOUBLE PRECISION NOT NULL,
  value_max DOUBLE PRECISION NOT NULL,
  value_last DOUBLE PRECISION NOT NULL,
  sample_count INTEGER NOT NULL DEFAULT 0,
  unit TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT sensor_readings_hourly_unique UNIQUE (meter_id, bucket)
);
GRANT SELECT ON public.sensor_readings_hourly TO authenticated;
GRANT ALL ON public.sensor_readings_hourly TO service_role;
ALTER TABLE public.sensor_readings_hourly ENABLE ROW LEVEL SECURITY;
CREATE POLICY "sensor_readings_hourly_tenant_select" ON public.sensor_readings_hourly
  FOR SELECT TO authenticated
  USING (tenant_id = public.get_user_tenant_id() OR public.has_role(auth.uid(), 'super_admin'));
CREATE POLICY "sensor_readings_hourly_service_all" ON public.sensor_readings_hourly
  FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE INDEX sensor_readings_hourly_meter_bucket_idx
  ON public.sensor_readings_hourly (meter_id, bucket DESC);
CREATE INDEX sensor_readings_hourly_tenant_idx
  ON public.sensor_readings_hourly (tenant_id);
ALTER TABLE public.sensor_readings_hourly SET (fillfactor = 90, autovacuum_vacuum_scale_factor = 0.05);

-- ---------- Daily ----------
CREATE TABLE public.sensor_readings_daily (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL,
  meter_id UUID NOT NULL,
  bucket DATE NOT NULL,
  value_twavg DOUBLE PRECISION NOT NULL,
  value_min DOUBLE PRECISION NOT NULL,
  value_max DOUBLE PRECISION NOT NULL,
  value_last DOUBLE PRECISION NOT NULL,
  sample_count INTEGER NOT NULL DEFAULT 0,
  unit TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT sensor_readings_daily_unique UNIQUE (meter_id, bucket)
);
GRANT SELECT ON public.sensor_readings_daily TO authenticated;
GRANT ALL ON public.sensor_readings_daily TO service_role;
ALTER TABLE public.sensor_readings_daily ENABLE ROW LEVEL SECURITY;
CREATE POLICY "sensor_readings_daily_tenant_select" ON public.sensor_readings_daily
  FOR SELECT TO authenticated
  USING (tenant_id = public.get_user_tenant_id() OR public.has_role(auth.uid(), 'super_admin'));
CREATE POLICY "sensor_readings_daily_service_all" ON public.sensor_readings_daily
  FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE INDEX sensor_readings_daily_meter_bucket_idx
  ON public.sensor_readings_daily (meter_id, bucket DESC);
CREATE INDEX sensor_readings_daily_tenant_idx
  ON public.sensor_readings_daily (tenant_id);

-- ---------- Monthly ----------
CREATE TABLE public.sensor_readings_monthly (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL,
  meter_id UUID NOT NULL,
  bucket DATE NOT NULL,
  value_twavg DOUBLE PRECISION NOT NULL,
  value_min DOUBLE PRECISION NOT NULL,
  value_max DOUBLE PRECISION NOT NULL,
  value_last DOUBLE PRECISION NOT NULL,
  sample_count INTEGER NOT NULL DEFAULT 0,
  unit TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT sensor_readings_monthly_unique UNIQUE (meter_id, bucket)
);
GRANT SELECT ON public.sensor_readings_monthly TO authenticated;
GRANT ALL ON public.sensor_readings_monthly TO service_role;
ALTER TABLE public.sensor_readings_monthly ENABLE ROW LEVEL SECURITY;
CREATE POLICY "sensor_readings_monthly_tenant_select" ON public.sensor_readings_monthly
  FOR SELECT TO authenticated
  USING (tenant_id = public.get_user_tenant_id() OR public.has_role(auth.uid(), 'super_admin'));
CREATE POLICY "sensor_readings_monthly_service_all" ON public.sensor_readings_monthly
  FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE INDEX sensor_readings_monthly_meter_bucket_idx
  ON public.sensor_readings_monthly (meter_id, bucket DESC);
CREATE INDEX sensor_readings_monthly_tenant_idx
  ON public.sensor_readings_monthly (tenant_id);

-- =====================================================================
-- Rollup-Funktionen (zeit-gewichteter Mittelwert)
-- =====================================================================

-- Aggregiert Rohdaten der letzten `lookback` Stunden in sensor_readings_hourly.
CREATE OR REPLACE FUNCTION public.rollup_sensor_hourly(lookback_hours INTEGER DEFAULT 3)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  affected INTEGER;
BEGIN
  WITH src AS (
    SELECT
      tenant_id,
      meter_id,
      date_trunc('hour', recorded_at) AS bucket,
      value,
      unit,
      recorded_at,
      LEAD(recorded_at) OVER (
        PARTITION BY meter_id, date_trunc('hour', recorded_at)
        ORDER BY recorded_at
      ) AS next_ts,
      -- Bucket-Ende
      date_trunc('hour', recorded_at) + INTERVAL '1 hour' AS bucket_end
    FROM public.sensor_readings_raw
    WHERE recorded_at >= now() - (lookback_hours || ' hours')::interval
  ),
  weighted AS (
    SELECT
      tenant_id, meter_id, bucket, unit, value, recorded_at,
      EXTRACT(EPOCH FROM (COALESCE(next_ts, bucket_end) - recorded_at)) AS weight_s
    FROM src
  ),
  agg AS (
    SELECT
      tenant_id,
      meter_id,
      bucket,
      MAX(unit) AS unit,
      -- Zeit-gewichteter Mittelwert. Wenn nur ein Sample: value.
      CASE
        WHEN SUM(weight_s) > 0 THEN SUM(value * weight_s) / SUM(weight_s)
        ELSE AVG(value)
      END AS value_twavg,
      MIN(value) AS value_min,
      MAX(value) AS value_max,
      (ARRAY_AGG(value ORDER BY recorded_at DESC))[1] AS value_last,
      COUNT(*)::int AS sample_count
    FROM weighted
    GROUP BY tenant_id, meter_id, bucket
  )
  INSERT INTO public.sensor_readings_hourly (
    tenant_id, meter_id, bucket, value_twavg, value_min, value_max, value_last, sample_count, unit, updated_at
  )
  SELECT tenant_id, meter_id, bucket, value_twavg, value_min, value_max, value_last, sample_count, unit, now()
  FROM agg
  ON CONFLICT (meter_id, bucket) DO UPDATE SET
    value_twavg = EXCLUDED.value_twavg,
    value_min = EXCLUDED.value_min,
    value_max = EXCLUDED.value_max,
    value_last = EXCLUDED.value_last,
    sample_count = EXCLUDED.sample_count,
    unit = COALESCE(EXCLUDED.unit, public.sensor_readings_hourly.unit),
    updated_at = now();
  GET DIAGNOSTICS affected = ROW_COUNT;
  RETURN affected;
END;
$$;

-- Aggregiert Stunden der letzten `lookback` Tage in sensor_readings_daily.
CREATE OR REPLACE FUNCTION public.rollup_sensor_daily(lookback_days INTEGER DEFAULT 3)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  affected INTEGER;
BEGIN
  WITH agg AS (
    SELECT
      tenant_id,
      meter_id,
      (bucket AT TIME ZONE 'Europe/Berlin')::date AS bucket_day,
      MAX(unit) AS unit,
      -- Stunden sind gleich lang → arithmetischer Mittelwert der TW-Averages
      AVG(value_twavg) AS value_twavg,
      MIN(value_min) AS value_min,
      MAX(value_max) AS value_max,
      (ARRAY_AGG(value_last ORDER BY bucket DESC))[1] AS value_last,
      SUM(sample_count)::int AS sample_count
    FROM public.sensor_readings_hourly
    WHERE bucket >= (now() - (lookback_days || ' days')::interval)
    GROUP BY tenant_id, meter_id, (bucket AT TIME ZONE 'Europe/Berlin')::date
  )
  INSERT INTO public.sensor_readings_daily (
    tenant_id, meter_id, bucket, value_twavg, value_min, value_max, value_last, sample_count, unit, updated_at
  )
  SELECT tenant_id, meter_id, bucket_day, value_twavg, value_min, value_max, value_last, sample_count, unit, now()
  FROM agg
  ON CONFLICT (meter_id, bucket) DO UPDATE SET
    value_twavg = EXCLUDED.value_twavg,
    value_min = EXCLUDED.value_min,
    value_max = EXCLUDED.value_max,
    value_last = EXCLUDED.value_last,
    sample_count = EXCLUDED.sample_count,
    unit = COALESCE(EXCLUDED.unit, public.sensor_readings_daily.unit),
    updated_at = now();
  GET DIAGNOSTICS affected = ROW_COUNT;
  RETURN affected;
END;
$$;

-- Aggregiert Tage der letzten `lookback` Monate in sensor_readings_monthly.
CREATE OR REPLACE FUNCTION public.rollup_sensor_monthly(lookback_months INTEGER DEFAULT 3)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  affected INTEGER;
BEGIN
  WITH agg AS (
    SELECT
      tenant_id,
      meter_id,
      date_trunc('month', bucket)::date AS bucket_month,
      MAX(unit) AS unit,
      AVG(value_twavg) AS value_twavg,
      MIN(value_min) AS value_min,
      MAX(value_max) AS value_max,
      (ARRAY_AGG(value_last ORDER BY bucket DESC))[1] AS value_last,
      SUM(sample_count)::int AS sample_count
    FROM public.sensor_readings_daily
    WHERE bucket >= (CURRENT_DATE - (lookback_months || ' months')::interval)::date
    GROUP BY tenant_id, meter_id, date_trunc('month', bucket)
  )
  INSERT INTO public.sensor_readings_monthly (
    tenant_id, meter_id, bucket, value_twavg, value_min, value_max, value_last, sample_count, unit, updated_at
  )
  SELECT tenant_id, meter_id, bucket_month, value_twavg, value_min, value_max, value_last, sample_count, unit, now()
  FROM agg
  ON CONFLICT (meter_id, bucket) DO UPDATE SET
    value_twavg = EXCLUDED.value_twavg,
    value_min = EXCLUDED.value_min,
    value_max = EXCLUDED.value_max,
    value_last = EXCLUDED.value_last,
    sample_count = EXCLUDED.sample_count,
    unit = COALESCE(EXCLUDED.unit, public.sensor_readings_monthly.unit),
    updated_at = now();
  GET DIAGNOSTICS affected = ROW_COUNT;
  RETURN affected;
END;
$$;

-- Rechte: Nur Cron/Service dürfen Rollups auslösen.
REVOKE ALL ON FUNCTION public.rollup_sensor_hourly(INTEGER) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.rollup_sensor_daily(INTEGER) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.rollup_sensor_monthly(INTEGER) FROM PUBLIC, anon, authenticated;

-- =====================================================================
-- Cleanup-Funktionen
-- =====================================================================
CREATE OR REPLACE FUNCTION public.cleanup_sensor_readings_hourly()
RETURNS INTEGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE deleted INTEGER;
BEGIN
  DELETE FROM public.sensor_readings_hourly WHERE bucket < now() - INTERVAL '2 years';
  GET DIAGNOSTICS deleted = ROW_COUNT;
  RETURN deleted;
END; $$;

CREATE OR REPLACE FUNCTION public.cleanup_sensor_readings_daily()
RETURNS INTEGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE deleted INTEGER;
BEGIN
  DELETE FROM public.sensor_readings_daily WHERE bucket < CURRENT_DATE - INTERVAL '5 years';
  GET DIAGNOSTICS deleted = ROW_COUNT;
  RETURN deleted;
END; $$;

REVOKE ALL ON FUNCTION public.cleanup_sensor_readings_hourly() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.cleanup_sensor_readings_daily() FROM PUBLIC, anon, authenticated;

-- =====================================================================
-- Cron-Jobs
-- =====================================================================

-- Stundenrollup :05
SELECT cron.schedule(
  'sensor-rollup-hourly',
  '5 * * * *',
  $cron$SELECT public.rollup_sensor_hourly(3);$cron$
);

-- Tagesrollup 00:15 Berlin (23:15 UTC im Winter, 22:15 im Sommer – akzeptable Näherung)
SELECT cron.schedule(
  'sensor-rollup-daily',
  '15 23 * * *',
  $cron$SELECT public.rollup_sensor_daily(3);$cron$
);

-- Monatsrollup am 1. um 00:45 Berlin (23:45 UTC am letzten Tag)
SELECT cron.schedule(
  'sensor-rollup-monthly',
  '45 23 28-31 * *',
  $cron$SELECT public.rollup_sensor_monthly(3);$cron$
);

-- Cleanups einmal täglich
SELECT cron.schedule(
  'sensor-cleanup-hourly',
  '30 3 * * *',
  $cron$SELECT public.cleanup_sensor_readings_hourly();$cron$
);
SELECT cron.schedule(
  'sensor-cleanup-daily',
  '35 3 * * *',
  $cron$SELECT public.cleanup_sensor_readings_daily();$cron$
);