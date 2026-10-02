
-- 1) Delta-Guard trigger: skip inserts that repeat the last value for a sensor within 30s
CREATE OR REPLACE FUNCTION public.sensor_readings_raw_delta_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_min_gap_seconds integer := 30;
  v_last_value numeric;
  v_last_recorded_at timestamptz;
BEGIN
  IF NEW.meter_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT value, recorded_at
    INTO v_last_value, v_last_recorded_at
  FROM public.sensor_readings_raw
  WHERE meter_id = NEW.meter_id
  ORDER BY recorded_at DESC
  LIMIT 1;

  IF v_last_recorded_at IS NOT NULL
     AND NEW.recorded_at - v_last_recorded_at < make_interval(secs => v_min_gap_seconds)
     AND v_last_value IS NOT DISTINCT FROM NEW.value
  THEN
    RETURN NULL; -- silently drop redundant sample
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sensor_readings_raw_delta_guard ON public.sensor_readings_raw;
CREATE TRIGGER trg_sensor_readings_raw_delta_guard
BEFORE INSERT ON public.sensor_readings_raw
FOR EACH ROW
EXECUTE FUNCTION public.sensor_readings_raw_delta_guard();

-- 2) Retention: 48h + batched hourly cleanup
CREATE OR REPLACE FUNCTION public.cleanup_sensor_readings_raw()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_batch integer := 20000;
  v_deleted integer := 0;
  v_total integer := 0;
  v_iterations integer := 0;
BEGIN
  LOOP
    WITH victims AS (
      SELECT id
      FROM public.sensor_readings_raw
      WHERE recorded_at < now() - interval '48 hours'
      LIMIT v_batch
    )
    DELETE FROM public.sensor_readings_raw r
    USING victims
    WHERE r.id = victims.id;
    GET DIAGNOSTICS v_deleted = ROW_COUNT;
    v_total := v_total + v_deleted;
    v_iterations := v_iterations + 1;
    EXIT WHEN v_deleted < v_batch OR v_iterations >= 20;
    PERFORM pg_sleep(0.1);
  END LOOP;
END;
$$;

-- Reschedule cleanup to hourly (was daily)
DO $$
BEGIN
  PERFORM cron.unschedule('sensor-readings-raw-cleanup');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

SELECT cron.schedule(
  'sensor-readings-raw-cleanup',
  '23 * * * *',
  $$SELECT public.cleanup_sensor_readings_raw();$$
);

-- 3) Incremental aggregator with watermark + hard time-budget
CREATE OR REPLACE FUNCTION public.aggregate_sensor_readings_5min(
  _since timestamp with time zone DEFAULT NULL,
  _until timestamp with time zone DEFAULT now(),
  _max_rows integer DEFAULT 20000
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_raw_rows integer := 0;
  v_buckets integer := 0;
  v_started_at timestamp with time zone := clock_timestamp();
  v_deadline timestamp with time zone := clock_timestamp() + interval '15 seconds';
  v_sensor_enabled boolean := true;
  v_emergency_mode boolean := false;
  v_watermark timestamp with time zone;
  v_since timestamp with time zone;
  v_until timestamp with time zone;
  v_last_processed timestamp with time zone;
BEGIN
  SELECT COALESCE(lower(value) NOT IN ('false','0','off','no'), true) INTO v_sensor_enabled
  FROM public.system_settings WHERE key = 'sensor_history_enabled';

  SELECT COALESCE(lower(value) IN ('true','1','on','yes'), false) INTO v_emergency_mode
  FROM public.system_settings WHERE key = 'backend_emergency_mode';

  IF COALESCE(v_sensor_enabled, true) IS FALSE THEN
    RETURN jsonb_build_object('success', true, 'skipped', 'sensor_history_disabled');
  END IF;
  IF COALESCE(v_emergency_mode, false) IS TRUE THEN
    RETURN jsonb_build_object('success', true, 'skipped', 'backend_emergency_mode');
  END IF;

  -- Load watermark from system_settings; fallback to 15 minutes ago
  SELECT value::timestamptz INTO v_watermark
  FROM public.system_settings WHERE key = 'sensor_aggregator_last_run_at';

  v_since := COALESCE(_since, v_watermark, now() - interval '15 minutes');
  v_until := COALESCE(_until, now());

  -- Safety: never process more than 1 hour in a single run
  IF v_until - v_since > interval '1 hour' THEN
    v_since := v_until - interval '1 hour';
  END IF;

  WITH bounded AS MATERIALIZED (
    SELECT tenant_id, meter_id, value, unit, recorded_at
    FROM public.sensor_readings_raw
    WHERE recorded_at >= v_since
      AND recorded_at < v_until
      AND meter_id IS NOT NULL
    ORDER BY recorded_at ASC
    LIMIT LEAST(GREATEST(COALESCE(_max_rows, 20000), 1000), 50000)
  ),
  raw_stats AS (
    SELECT count(*)::integer AS c, max(recorded_at) AS max_at FROM bounded
  ),
  grouped AS (
    SELECT
      tenant_id, meter_id,
      date_bin(interval '5 minutes', recorded_at, timestamptz '2000-01-01 00:00:00+00') AS bucket,
      avg(value) AS value_avg,
      min(value) AS value_min,
      max(value) AS value_max,
      (array_agg(value ORDER BY recorded_at DESC))[1] AS value_last,
      count(*)::integer AS sample_count,
      (array_remove(array_agg(unit ORDER BY recorded_at DESC), NULL))[1] AS unit
    FROM bounded
    GROUP BY tenant_id, meter_id,
             date_bin(interval '5 minutes', recorded_at, timestamptz '2000-01-01 00:00:00+00')
  ),
  upserted AS (
    INSERT INTO public.sensor_readings_5min
      (tenant_id, meter_id, bucket, value_avg, value_min, value_max, value_last, sample_count, unit, updated_at)
    SELECT tenant_id, meter_id, bucket, value_avg, value_min, value_max, value_last, sample_count, unit, now()
    FROM grouped
    ON CONFLICT (meter_id, bucket) DO UPDATE SET
      tenant_id = EXCLUDED.tenant_id,
      value_avg = EXCLUDED.value_avg,
      value_min = EXCLUDED.value_min,
      value_max = EXCLUDED.value_max,
      value_last = EXCLUDED.value_last,
      sample_count = EXCLUDED.sample_count,
      unit = EXCLUDED.unit,
      updated_at = now()
    RETURNING 1
  )
  SELECT raw_stats.c, count(upserted.*)::integer, raw_stats.max_at
    INTO v_raw_rows, v_buckets, v_last_processed
  FROM raw_stats LEFT JOIN upserted ON true
  GROUP BY raw_stats.c, raw_stats.max_at;

  -- Advance watermark only if we did not blow the deadline
  IF clock_timestamp() < v_deadline THEN
    INSERT INTO public.system_settings (key, value)
    VALUES ('sensor_aggregator_last_run_at', COALESCE(v_last_processed, v_until)::text)
    ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now();
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'raw_rows', COALESCE(v_raw_rows, 0),
    'buckets', COALESCE(v_buckets, 0),
    'since', v_since,
    'until', v_until,
    'watermark_advanced_to', COALESCE(v_last_processed, v_until),
    'ms', GREATEST(0, EXTRACT(milliseconds FROM clock_timestamp() - v_started_at)::integer),
    'deadline_hit', clock_timestamp() >= v_deadline
  );
END;
$$;
