CREATE OR REPLACE FUNCTION public.compact_meter_power_readings_15min(
  p_retention_days integer DEFAULT 90,
  p_max_groups integer DEFAULT 4000,
  p_max_batches integer DEFAULT 1
)
RETURNS TABLE(groups_written integer, rows_removed integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_cutoff timestamptz := date_trunc('day', now() - make_interval(days => greatest(p_retention_days, 30)));
  v_groups integer := 0;
  v_rows integer := 0;
  v_g integer;
  v_r integer;
  i integer;
BEGIN
  FOR i IN 1..greatest(p_max_batches, 1) LOOP
    WITH grp AS (
      SELECT r.meter_id,
             date_trunc('hour', r.bucket)
               + (floor(extract(minute FROM r.bucket) / 15) * interval '15 minutes') AS b15
      FROM public.meter_power_readings_5min r
      WHERE r.resolution_minutes = 5
        AND r.bucket < v_cutoff
      GROUP BY 1, 2
      LIMIT greatest(p_max_groups, 1)
    ),
    src AS (
      SELECT r.id, r.meter_id, r.tenant_id, r.energy_type, r.power_avg, r.power_max,
             r.sample_count, r.source, g.b15
      FROM public.meter_power_readings_5min r
      JOIN grp g
        ON g.meter_id = r.meter_id
       AND r.bucket >= g.b15
       AND r.bucket <  g.b15 + interval '15 minutes'
      WHERE r.resolution_minutes = 5
    ),
    agg AS (
      SELECT s.meter_id,
             s.b15 AS bucket,
             min(s.tenant_id)   AS tenant_id,
             min(s.energy_type) AS energy_type,
             (sum(s.power_avg * coalesce(s.sample_count, 1))
                / nullif(sum(coalesce(s.sample_count, 1)), 0)) AS power_avg,
             max(s.power_max)                 AS power_max,
             sum(coalesce(s.sample_count, 1)) AS sample_count,
             min(s.source)                    AS source
      FROM src s
      GROUP BY s.meter_id, s.b15
    ),
    ins AS (
      INSERT INTO public.meter_power_readings_5min
        (meter_id, tenant_id, energy_type, power_avg, power_max, bucket,
         sample_count, resolution_minutes, source)
      SELECT a.meter_id, a.tenant_id, a.energy_type, a.power_avg, a.power_max, a.bucket,
             a.sample_count, 15, coalesce(a.source, 'compact_15min')
      FROM agg a
      ON CONFLICT (meter_id, bucket, resolution_minutes) DO UPDATE
        SET power_avg    = EXCLUDED.power_avg,
            power_max    = GREATEST(public.meter_power_readings_5min.power_max, EXCLUDED.power_max),
            sample_count = EXCLUDED.sample_count,
            tenant_id    = EXCLUDED.tenant_id,
            energy_type  = EXCLUDED.energy_type
      RETURNING 1
    ),
    del AS (
      DELETE FROM public.meter_power_readings_5min t
      USING src
      WHERE t.id = src.id
      RETURNING 1
    )
    SELECT (SELECT count(*) FROM ins)::integer,
           (SELECT count(*) FROM del)::integer
    INTO v_g, v_r;

    v_groups := v_groups + coalesce(v_g, 0);
    v_rows   := v_rows   + coalesce(v_r, 0);

    EXIT WHEN coalesce(v_r, 0) = 0;
  END LOOP;

  RETURN QUERY SELECT v_groups, v_rows;
END;
$function$;

REVOKE ALL ON FUNCTION public.compact_meter_power_readings_15min(integer, integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.compact_meter_power_readings_15min(integer, integer, integer) TO service_role;