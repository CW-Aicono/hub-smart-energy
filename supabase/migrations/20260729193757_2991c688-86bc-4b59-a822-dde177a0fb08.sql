-- 1) Aggressiveres Autovacuum für die Hot-Tables
ALTER TABLE public.meter_power_readings_5min SET (
  autovacuum_vacuum_scale_factor = 0.01,
  autovacuum_analyze_scale_factor = 0.01,
  autovacuum_vacuum_cost_delay = 2,
  autovacuum_vacuum_cost_limit = 2000
);
ALTER TABLE public.meter_cumulative_readings SET (
  autovacuum_vacuum_scale_factor = 0.01,
  autovacuum_analyze_scale_factor = 0.01,
  autovacuum_vacuum_cost_delay = 2,
  autovacuum_vacuum_cost_limit = 2000
);
ALTER TABLE public.meter_power_readings SET (
  autovacuum_vacuum_scale_factor = 0.02,
  autovacuum_analyze_scale_factor = 0.02,
  autovacuum_vacuum_cost_delay = 2,
  autovacuum_vacuum_cost_limit = 2000
);
ALTER TABLE public.sensor_readings_raw SET (
  autovacuum_vacuum_scale_factor = 0.02,
  autovacuum_analyze_scale_factor = 0.02,
  autovacuum_vacuum_cost_delay = 2,
  autovacuum_vacuum_cost_limit = 2000
);

-- 2) Batch-Cleanup für 5-Minuten-Rohaggregate (Retention 90 Tage),
--    nur wenn für den betroffenen Tag bereits ein Tagesaggregat existiert.
CREATE OR REPLACE FUNCTION public.cleanup_meter_power_readings_5min(
  p_retention_days integer DEFAULT 90,
  p_batch_size integer DEFAULT 20000,
  p_max_batches integer DEFAULT 10
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cutoff timestamptz := now() - make_interval(days => greatest(p_retention_days, 30));
  v_deleted integer := 0;
  v_batch integer;
  i integer;
BEGIN
  FOR i IN 1..greatest(p_max_batches, 1) LOOP
    WITH doomed AS (
      SELECT r.id
      FROM public.meter_power_readings_5min r
      WHERE r.bucket < v_cutoff
        AND EXISTS (
          SELECT 1 FROM public.meter_daily_totals_mv d
          WHERE d.meter_id = r.meter_id
            AND d.bucket_start::date = (r.bucket AT TIME ZONE 'Europe/Berlin')::date
        )
      LIMIT p_batch_size
    )
    DELETE FROM public.meter_power_readings_5min t
    USING doomed
    WHERE t.id = doomed.id;

    GET DIAGNOSTICS v_batch = ROW_COUNT;
    v_deleted := v_deleted + v_batch;
    EXIT WHEN v_batch = 0;
  END LOOP;

  RETURN v_deleted;
END;
$$;

REVOKE ALL ON FUNCTION public.cleanup_meter_power_readings_5min(integer, integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cleanup_meter_power_readings_5min(integer, integer, integer) TO service_role;