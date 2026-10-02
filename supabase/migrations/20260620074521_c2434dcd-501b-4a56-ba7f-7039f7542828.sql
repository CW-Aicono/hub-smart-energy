CREATE OR REPLACE FUNCTION public.aggregate_pv_actual_hourly(p_from timestamp with time zone DEFAULT (date_trunc('hour'::text, now()) - '48:00:00'::interval), p_to timestamp with time zone DEFAULT date_trunc('hour'::text, now()))
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_upserted integer := 0;
BEGIN
  IF p_to <= p_from THEN
    RETURN 0;
  END IF;

  WITH active_meters AS (
    SELECT settings.tenant_id, settings.location_id, settings.pv_meter_id
    FROM public.pv_forecast_settings settings
    JOIN public.locations loc
      ON loc.id = settings.location_id
     AND loc.tenant_id = settings.tenant_id
    JOIN public.meters meter
      ON meter.id = settings.pv_meter_id
     AND meter.tenant_id = settings.tenant_id
     AND (meter.location_id = settings.location_id OR meter.location_id IS NULL)
    WHERE settings.is_active = true
      AND settings.pv_meter_id IS NOT NULL
  ),
  hours AS (
    SELECT generate_series(
      date_trunc('hour', p_from),
      date_trunc('hour', p_to) - interval '1 hour',
      interval '1 hour'
    ) AS hour_start
  ),
  hour_meter AS (
    SELECT am.tenant_id, am.location_id, am.pv_meter_id, h.hour_start
    FROM active_meters am
    CROSS JOIN hours h
  ),
  start_reading AS (
    SELECT
      hm.tenant_id, hm.location_id, hm.pv_meter_id, hm.hour_start,
      (
        SELECT mcr.kwh_total
        FROM public.meter_cumulative_readings mcr
        WHERE mcr.meter_id = hm.pv_meter_id
          AND mcr.reading_at <= hm.hour_start
          AND mcr.reading_at >= hm.hour_start - interval '6 hours'
        ORDER BY mcr.reading_at DESC
        LIMIT 1
      ) AS kwh_start
    FROM hour_meter hm
  ),
  end_reading AS (
    SELECT
      sr.tenant_id, sr.location_id, sr.pv_meter_id, sr.hour_start, sr.kwh_start,
      (
        SELECT mcr.kwh_total
        FROM public.meter_cumulative_readings mcr
        WHERE mcr.meter_id = sr.pv_meter_id
          AND mcr.reading_at <= sr.hour_start + interval '1 hour'
          AND mcr.reading_at >  sr.hour_start
        ORDER BY mcr.reading_at DESC
        LIMIT 1
      ) AS kwh_end
    FROM start_reading sr
  ),
  counter_based AS (
    SELECT
      tenant_id, location_id, pv_meter_id, hour_start,
      GREATEST(kwh_end - kwh_start, 0)::double precision AS actual_kwh
    FROM end_reading
    WHERE kwh_start IS NOT NULL
      AND kwh_end IS NOT NULL
      AND kwh_end >= kwh_start
  ),
  -- Fallback: 5-Min-Integration mit ABS (PV kommt teils negativ aus Loxone)
  power_based AS (
    SELECT
      am.tenant_id, am.location_id, am.pv_meter_id,
      date_trunc('hour', readings.bucket) AS hour_start,
      ROUND(SUM(ABS(readings.power_avg) * (5.0 / 60.0))::numeric, 4)::double precision AS actual_kwh
    FROM active_meters am
    CROSS JOIN LATERAL public.get_power_readings_5min(ARRAY[am.pv_meter_id], p_from, p_to) readings
    GROUP BY am.tenant_id, am.location_id, am.pv_meter_id, date_trunc('hour', readings.bucket)
    HAVING SUM(ABS(readings.power_avg) * (5.0 / 60.0)) > 0
  ),
  merged AS (
    SELECT tenant_id, location_id, pv_meter_id, hour_start, actual_kwh, 'counter_delta'::text AS source
    FROM counter_based
    WHERE actual_kwh > 0
    UNION ALL
    SELECT pb.tenant_id, pb.location_id, pb.pv_meter_id, pb.hour_start, pb.actual_kwh, 'aggregated_5min'::text AS source
    FROM power_based pb
    WHERE NOT EXISTS (
      SELECT 1 FROM counter_based cb
      WHERE cb.pv_meter_id = pb.pv_meter_id
        AND cb.hour_start = pb.hour_start
        AND cb.actual_kwh > 0
    )
  )
  INSERT INTO public.pv_actual_hourly (
    tenant_id, location_id, meter_id, hour_start, actual_kwh,
    source, sample_count, coverage_minutes
  )
  SELECT
    tenant_id, location_id, pv_meter_id, hour_start, actual_kwh,
    source, 12, 60
  FROM merged
  ON CONFLICT (meter_id, hour_start) DO UPDATE SET
    tenant_id = EXCLUDED.tenant_id,
    location_id = EXCLUDED.location_id,
    actual_kwh = EXCLUDED.actual_kwh,
    source = EXCLUDED.source,
    sample_count = EXCLUDED.sample_count,
    coverage_minutes = EXCLUDED.coverage_minutes,
    updated_at = now();

  GET DIAGNOSTICS v_upserted = ROW_COUNT;
  RETURN v_upserted;
END;
$function$;