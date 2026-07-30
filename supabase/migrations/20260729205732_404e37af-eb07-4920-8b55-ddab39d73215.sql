
-- 1) Hourly rollup table
CREATE TABLE IF NOT EXISTS public.meter_power_readings_hourly (
  meter_id uuid NOT NULL,
  tenant_id uuid NOT NULL,
  energy_type text,
  bucket timestamptz NOT NULL,
  power_avg numeric,
  power_max numeric,
  sample_count integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (meter_id, bucket)
);

CREATE INDEX IF NOT EXISTS meter_power_hourly_tenant_bucket_idx
  ON public.meter_power_readings_hourly (tenant_id, bucket DESC);

GRANT SELECT ON public.meter_power_readings_hourly TO authenticated;
GRANT ALL ON public.meter_power_readings_hourly TO service_role;

ALTER TABLE public.meter_power_readings_hourly ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant users can view hourly readings"
  ON public.meter_power_readings_hourly FOR SELECT
  TO authenticated
  USING (tenant_id = (SELECT public.get_user_tenant_id()));

CREATE POLICY "Partner members can read hourly readings"
  ON public.meter_power_readings_hourly FOR SELECT
  TO authenticated
  USING (public.partner_has_tenant_access((SELECT auth.uid()), tenant_id));

-- 2) Incremental hourly rollup
CREATE OR REPLACE FUNCTION public.rollup_meter_power_hourly(p_lookback_hours integer DEFAULT 6)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_from timestamptz := date_trunc('hour', now()) - make_interval(hours => GREATEST(p_lookback_hours, 1));
  v_rows integer := 0;
BEGIN
  WITH src AS (
    SELECT m5.meter_id, m5.tenant_id, m5.energy_type,
           date_trunc('hour', m5.bucket) AS bucket,
           m5.power_avg, m5.power_max,
           COALESCE(m5.sample_count, 1) AS sample_count,
           COALESCE(m5.resolution_minutes, 5) AS res
    FROM public.meter_power_readings_5min m5
    WHERE m5.bucket >= v_from AND m5.bucket < date_trunc('hour', now())
    UNION ALL
    SELECT b.meter_id, b.tenant_id, b.energy_type,
           date_trunc('hour', b.bucket) AS bucket,
           b.power_avg, b.power_max,
           COALESCE(b.sample_count, 1) AS sample_count,
           COALESCE(b.resolution_minutes, 5) AS res
    FROM public.meter_power_readings_5min_bridge b
    WHERE b.bucket >= v_from AND b.bucket < date_trunc('hour', now())
  ), agg AS (
    SELECT meter_id,
           min(tenant_id) AS tenant_id,
           min(energy_type) AS energy_type,
           bucket,
           (sum(power_avg * res) / NULLIF(sum(res), 0))::numeric AS power_avg,
           max(power_max)::numeric AS power_max,
           sum(sample_count)::int AS sample_count
    FROM src
    GROUP BY meter_id, bucket
  )
  INSERT INTO public.meter_power_readings_hourly
    (meter_id, tenant_id, energy_type, bucket, power_avg, power_max, sample_count, updated_at)
  SELECT meter_id, tenant_id, energy_type, bucket, power_avg, power_max, sample_count, now()
  FROM agg
  ON CONFLICT (meter_id, bucket) DO UPDATE
    SET power_avg = EXCLUDED.power_avg,
        power_max = EXCLUDED.power_max,
        sample_count = EXCLUDED.sample_count,
        energy_type = COALESCE(EXCLUDED.energy_type, public.meter_power_readings_hourly.energy_type),
        updated_at = now()
    WHERE public.meter_power_readings_hourly.power_avg IS DISTINCT FROM EXCLUDED.power_avg
       OR public.meter_power_readings_hourly.power_max IS DISTINCT FROM EXCLUDED.power_max
       OR public.meter_power_readings_hourly.sample_count IS DISTINCT FROM EXCLUDED.sample_count;

  GET DIAGNOSTICS v_rows = ROW_COUNT;
  RETURN v_rows;
END;
$$;

REVOKE ALL ON FUNCTION public.rollup_meter_power_hourly(integer) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rollup_meter_power_hourly(integer) TO service_role;

-- 3) Backfill helper (batched by day, for catching up history)
CREATE OR REPLACE FUNCTION public.backfill_meter_power_hourly(p_days integer DEFAULT 1)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_max timestamptz;
  v_min timestamptz;
  v_day date;
  v_rows integer := 0;
  i integer := 0;
BEGIN
  SELECT min(bucket) INTO v_min FROM public.meter_power_readings_5min;
  SELECT COALESCE(min(bucket), now()) INTO v_max FROM public.meter_power_readings_hourly;
  IF v_min IS NULL THEN RETURN 0; END IF;

  v_day := date_trunc('day', LEAST(v_max, now()))::date - 1;

  WHILE i < GREATEST(p_days, 1) AND v_day >= v_min::date LOOP
    WITH src AS (
      SELECT m5.meter_id, m5.tenant_id, m5.energy_type,
             date_trunc('hour', m5.bucket) AS bucket,
             m5.power_avg, m5.power_max,
             COALESCE(m5.sample_count, 1) AS sample_count,
             COALESCE(m5.resolution_minutes, 5) AS res
      FROM public.meter_power_readings_5min m5
      WHERE m5.bucket >= v_day::timestamptz AND m5.bucket < (v_day + 1)::timestamptz
    ), agg AS (
      SELECT meter_id, min(tenant_id) AS tenant_id, min(energy_type) AS energy_type, bucket,
             (sum(power_avg * res) / NULLIF(sum(res), 0))::numeric AS power_avg,
             max(power_max)::numeric AS power_max,
             sum(sample_count)::int AS sample_count
      FROM src GROUP BY meter_id, bucket
    )
    INSERT INTO public.meter_power_readings_hourly
      (meter_id, tenant_id, energy_type, bucket, power_avg, power_max, sample_count, updated_at)
    SELECT meter_id, tenant_id, energy_type, bucket, power_avg, power_max, sample_count, now()
    FROM agg
    ON CONFLICT (meter_id, bucket) DO NOTHING;

    GET DIAGNOSTICS v_rows = ROW_COUNT;
    i := i + 1;
    v_day := v_day - 1;
  END LOOP;

  RETURN v_rows;
END;
$$;

REVOKE ALL ON FUNCTION public.backfill_meter_power_hourly(integer) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.backfill_meter_power_hourly(integer) TO service_role;

-- 4) Zoom-aware read function
CREATE OR REPLACE FUNCTION public.get_power_series_auto(
  p_meter_ids uuid[],
  p_start timestamptz,
  p_end timestamptz,
  p_max_points integer DEFAULT 800
)
RETURNS TABLE(meter_id uuid, bucket timestamptz, power_avg double precision, power_max double precision, resolution_minutes integer)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_span_minutes numeric := GREATEST(EXTRACT(EPOCH FROM (p_end - p_start)) / 60.0, 1);
  v_step integer;
  v_ids uuid[];
  v_uid uuid := auth.uid();
  v_max_points integer := GREATEST(COALESCE(p_max_points, 800), 100);
BEGIN
  -- Access guard: when called by a logged-in user, restrict to accessible meters
  IF v_uid IS NULL THEN
    v_ids := p_meter_ids;
  ELSE
    SELECT array_agg(m.id) INTO v_ids
    FROM public.meters m
    WHERE m.id = ANY(p_meter_ids)
      AND (
        m.tenant_id = (SELECT public.get_user_tenant_id())
        OR public.partner_has_tenant_access(v_uid, m.tenant_id)
        OR public.has_role(v_uid, 'super_admin'::app_role)
      );
  END IF;

  IF v_ids IS NULL OR array_length(v_ids, 1) IS NULL THEN
    RETURN;
  END IF;

  -- Pick resolution by zoom level
  IF v_span_minutes <= 2 * 24 * 60 THEN
    v_step := 5;
  ELSIF v_span_minutes <= 14 * 24 * 60 THEN
    v_step := 15;
  ELSIF v_span_minutes <= 92 * 24 * 60 THEN
    v_step := 60;
  ELSE
    v_step := 1440;
  END IF;

  -- Hard cap on points per series
  WHILE (v_span_minutes / v_step) > v_max_points AND v_step < 1440 LOOP
    v_step := CASE v_step WHEN 5 THEN 15 WHEN 15 THEN 60 ELSE 1440 END;
  END LOOP;

  IF v_step >= 60 THEN
    RETURN QUERY
    SELECT h.meter_id,
           date_bin(make_interval(mins => v_step), h.bucket, timestamptz 'epoch') AS bucket,
           (sum(h.power_avg) / NULLIF(count(*), 0))::double precision AS power_avg,
           max(h.power_max)::double precision AS power_max,
           v_step AS resolution_minutes
    FROM public.meter_power_readings_hourly h
    WHERE h.meter_id = ANY(v_ids)
      AND h.bucket >= p_start AND h.bucket <= p_end
    GROUP BY h.meter_id, 2
    ORDER BY 1, 2;
  ELSE
    RETURN QUERY
    WITH combined AS (
      SELECT b.meter_id, b.bucket, b.power_avg, b.power_max,
             COALESCE(b.resolution_minutes, 5) AS res,
             COALESCE(b.sample_count, 1) + 1000 AS prio
      FROM public.meter_power_readings_5min_bridge b
      WHERE b.meter_id = ANY(v_ids) AND b.bucket >= p_start AND b.bucket <= p_end
      UNION ALL
      SELECT m5.meter_id, m5.bucket, m5.power_avg, m5.power_max,
             COALESCE(m5.resolution_minutes, 5) AS res,
             COALESCE(m5.sample_count, 1) AS prio
      FROM public.meter_power_readings_5min m5
      WHERE m5.meter_id = ANY(v_ids) AND m5.bucket >= p_start AND m5.bucket <= p_end
    ), dedup AS (
      SELECT DISTINCT ON (c.meter_id, c.bucket)
             c.meter_id, c.bucket, c.power_avg, c.power_max, c.res
      FROM combined c
      ORDER BY c.meter_id, c.bucket, c.prio DESC
    )
    SELECT d.meter_id,
           date_bin(make_interval(mins => v_step), d.bucket, timestamptz 'epoch') AS bucket,
           (sum(d.power_avg * d.res) / NULLIF(sum(d.res), 0))::double precision AS power_avg,
           max(d.power_max)::double precision AS power_max,
           v_step AS resolution_minutes
    FROM dedup d
    GROUP BY d.meter_id, 2
    ORDER BY 1, 2;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_power_series_auto(uuid[], timestamptz, timestamptz, integer) TO authenticated, service_role;
