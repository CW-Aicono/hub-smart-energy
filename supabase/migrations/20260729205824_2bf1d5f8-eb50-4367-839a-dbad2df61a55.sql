
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
           (array_agg(tenant_id ORDER BY tenant_id))[1] AS tenant_id,
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
  WHERE tenant_id IS NOT NULL
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

CREATE OR REPLACE FUNCTION public.backfill_meter_power_hourly(p_days integer DEFAULT 1)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_min timestamptz;
  v_oldest_hourly timestamptz;
  v_day date;
  v_rows integer := 0;
  i integer := 0;
BEGIN
  SELECT min(bucket) INTO v_min FROM public.meter_power_readings_5min;
  IF v_min IS NULL THEN RETURN 0; END IF;

  SELECT min(bucket) INTO v_oldest_hourly FROM public.meter_power_readings_hourly;
  v_day := (date_trunc('day', COALESCE(v_oldest_hourly, now())))::date - 1;

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
      SELECT meter_id,
             (array_agg(tenant_id ORDER BY tenant_id))[1] AS tenant_id,
             min(energy_type) AS energy_type, bucket,
             (sum(power_avg * res) / NULLIF(sum(res), 0))::numeric AS power_avg,
             max(power_max)::numeric AS power_max,
             sum(sample_count)::int AS sample_count
      FROM src GROUP BY meter_id, bucket
    )
    INSERT INTO public.meter_power_readings_hourly
      (meter_id, tenant_id, energy_type, bucket, power_avg, power_max, sample_count, updated_at)
    SELECT meter_id, tenant_id, energy_type, bucket, power_avg, power_max, sample_count, now()
    FROM agg
    WHERE tenant_id IS NOT NULL
    ON CONFLICT (meter_id, bucket) DO NOTHING;

    GET DIAGNOSTICS v_rows = ROW_COUNT;
    i := i + 1;
    v_day := v_day - 1;
  END LOOP;

  RETURN v_rows;
END;
$$;
