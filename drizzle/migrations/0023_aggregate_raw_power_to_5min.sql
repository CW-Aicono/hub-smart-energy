CREATE OR REPLACE FUNCTION public.aggregate_raw_power_to_5min(
  p_meter_ids uuid[] DEFAULT NULL,
  p_lookback_minutes integer DEFAULT 30
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_from timestamptz := date_bin(interval '5 minutes',
                          now() - make_interval(mins => LEAST(GREATEST(COALESCE(p_lookback_minutes, 30), 5), 7 * 24 * 60)),
                          timestamptz 'epoch');
  v_rows integer := 0;
BEGIN
  WITH agg AS (
    SELECT r.meter_id,
           date_bin(interval '5 minutes', r.recorded_at, timestamptz 'epoch') AS bucket,
           min(r.tenant_id::text)::uuid AS tenant_id,
           min(r.energy_type) AS energy_type,
           avg(r.power_value) AS power_avg,
           max(r.power_value) AS power_max,
           count(*)::integer AS sample_count
    FROM public.meter_power_readings r
    WHERE r.recorded_at >= v_from
      AND r.meter_id IS NOT NULL
      AND (p_meter_ids IS NULL OR r.meter_id = ANY(p_meter_ids))
    GROUP BY 1, 2
  ), ins AS (
    INSERT INTO public.meter_power_readings_5min
      (meter_id, tenant_id, energy_type, power_avg, power_max, bucket, sample_count, resolution_minutes, source)
    SELECT a.meter_id, a.tenant_id, a.energy_type, a.power_avg, a.power_max, a.bucket, a.sample_count, 5, 'raw_rollup'
    FROM agg a
    ON CONFLICT (meter_id, bucket, resolution_minutes) DO UPDATE
      SET power_avg    = EXCLUDED.power_avg,
          power_max    = EXCLUDED.power_max,
          sample_count = EXCLUDED.sample_count
      WHERE public.meter_power_readings_5min.source IS NULL
         OR public.meter_power_readings_5min.source = 'raw_rollup'
    RETURNING 1
  )
  SELECT count(*)::integer INTO v_rows FROM ins;
  RETURN v_rows;
END;
$function$;

REVOKE ALL ON FUNCTION public.aggregate_raw_power_to_5min(uuid[], integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.aggregate_raw_power_to_5min(uuid[], integer) TO service_role;

-- Einmalige Nachberechnung der noch vorhandenen Rohwerte (max. 7 Tage)
SELECT public.aggregate_raw_power_to_5min(NULL, 7 * 24 * 60);