
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
  v_hourly_from timestamptz;
BEGIN
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

  IF v_span_minutes <= 2 * 24 * 60 THEN
    v_step := 5;
  ELSIF v_span_minutes <= 14 * 24 * 60 THEN
    v_step := 15;
  ELSIF v_span_minutes <= 92 * 24 * 60 THEN
    v_step := 60;
  ELSE
    v_step := 1440;
  END IF;

  WHILE (v_span_minutes / v_step) > v_max_points AND v_step < 1440 LOOP
    v_step := CASE v_step WHEN 5 THEN 15 WHEN 15 THEN 60 ELSE 1440 END;
  END LOOP;

  IF v_step >= 60 THEN
    SELECT COALESCE(min(h.bucket), 'infinity'::timestamptz)
      INTO v_hourly_from
      FROM public.meter_power_readings_hourly h
      WHERE h.meter_id = ANY(v_ids);

    RETURN QUERY
    WITH src AS (
      SELECT h.meter_id, h.bucket, h.power_avg, h.power_max, 60 AS res
      FROM public.meter_power_readings_hourly h
      WHERE h.meter_id = ANY(v_ids)
        AND h.bucket >= p_start AND h.bucket <= p_end
      UNION ALL
      -- fallback for history not rolled up yet
      SELECT m5.meter_id, m5.bucket, m5.power_avg, m5.power_max,
             COALESCE(m5.resolution_minutes, 5) AS res
      FROM public.meter_power_readings_5min m5
      WHERE m5.meter_id = ANY(v_ids)
        AND m5.bucket >= p_start AND m5.bucket <= LEAST(p_end, v_hourly_from - interval '1 microsecond')
    )
    SELECT s.meter_id,
           date_bin(make_interval(mins => v_step), s.bucket, timestamptz 'epoch') AS bucket,
           (sum(s.power_avg * s.res) / NULLIF(sum(s.res), 0))::double precision AS power_avg,
           max(s.power_max)::double precision AS power_max,
           v_step AS resolution_minutes
    FROM src s
    GROUP BY s.meter_id, 2
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
