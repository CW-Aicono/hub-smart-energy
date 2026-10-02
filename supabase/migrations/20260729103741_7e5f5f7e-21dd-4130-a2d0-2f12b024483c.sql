CREATE OR REPLACE FUNCTION public.aggregate_sensor_readings_5min(
  _since timestamp with time zone DEFAULT now() - interval '15 minutes',
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
  v_sensor_enabled boolean := true;
  v_emergency_mode boolean := false;
BEGIN
  SELECT COALESCE(lower(value) NOT IN ('false', '0', 'off', 'no'), true)
    INTO v_sensor_enabled
  FROM public.system_settings
  WHERE key = 'sensor_history_enabled';

  SELECT COALESCE(lower(value) IN ('true', '1', 'on', 'yes'), false)
    INTO v_emergency_mode
  FROM public.system_settings
  WHERE key = 'backend_emergency_mode';

  IF COALESCE(v_sensor_enabled, true) IS FALSE THEN
    RETURN jsonb_build_object('success', true, 'skipped', 'sensor_history_disabled', 'raw_rows', 0, 'buckets', 0);
  END IF;

  IF COALESCE(v_emergency_mode, false) IS TRUE THEN
    RETURN jsonb_build_object('success', true, 'skipped', 'backend_emergency_mode', 'raw_rows', 0, 'buckets', 0);
  END IF;

  WITH bounded AS MATERIALIZED (
    SELECT tenant_id, meter_id, value, unit, recorded_at
    FROM public.sensor_readings_raw
    WHERE recorded_at >= _since
      AND recorded_at < _until
      AND meter_id IS NOT NULL
    ORDER BY recorded_at ASC
    LIMIT LEAST(GREATEST(COALESCE(_max_rows, 20000), 1000), 50000)
  ),
  raw_count AS (
    SELECT count(*)::integer AS c FROM bounded
  ),
  grouped AS (
    SELECT
      tenant_id,
      meter_id,
      date_bin(interval '5 minutes', recorded_at, timestamp with time zone '2000-01-01 00:00:00+00') AS bucket,
      avg(value) AS value_avg,
      min(value) AS value_min,
      max(value) AS value_max,
      (array_agg(value ORDER BY recorded_at DESC))[1] AS value_last,
      count(*)::integer AS sample_count,
      (array_remove(array_agg(unit ORDER BY recorded_at DESC), NULL))[1] AS unit
    FROM bounded
    GROUP BY tenant_id, meter_id, date_bin(interval '5 minutes', recorded_at, timestamp with time zone '2000-01-01 00:00:00+00')
  ),
  upserted AS (
    INSERT INTO public.sensor_readings_5min (
      tenant_id,
      meter_id,
      bucket,
      value_avg,
      value_min,
      value_max,
      value_last,
      sample_count,
      unit,
      updated_at
    )
    SELECT
      tenant_id,
      meter_id,
      bucket,
      value_avg,
      value_min,
      value_max,
      value_last,
      sample_count,
      unit,
      now()
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
  SELECT raw_count.c, count(upserted.*)::integer
    INTO v_raw_rows, v_buckets
  FROM raw_count
  LEFT JOIN upserted ON true
  GROUP BY raw_count.c;

  RETURN jsonb_build_object(
    'success', true,
    'raw_rows', COALESCE(v_raw_rows, 0),
    'buckets', COALESCE(v_buckets, 0),
    'ms', GREATEST(0, EXTRACT(milliseconds FROM clock_timestamp() - v_started_at)::integer)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.aggregate_sensor_readings_5min(timestamp with time zone, timestamp with time zone, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.aggregate_sensor_readings_5min(timestamp with time zone, timestamp with time zone, integer) TO service_role;