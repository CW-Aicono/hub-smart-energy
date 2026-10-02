DO $replica_identity$
DECLARE
  v_relation regclass;
BEGIN
  FOR v_relation IN
    SELECT relid
    FROM pg_partition_tree('public.meter_power_readings_5min'::regclass)
  LOOP
    EXECUTE format('ALTER TABLE %s REPLICA IDENTITY FULL', v_relation);
  END LOOP;
END
$replica_identity$;

DO $cleanup$
DECLARE
  v_orphans bigint := 0;
  v_remaining bigint := 0;
BEGIN
  UPDATE public.meter_power_readings_5min m5
  SET meter_id = NULL
  WHERE m5.meter_id IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM public.meters m WHERE m.id = m5.meter_id);
  GET DIAGNOSTICS v_orphans = ROW_COUNT;
  RAISE NOTICE 'Preflight: % verwaiste 5-Minuten-Zuordnungen auf NULL gesetzt', v_orphans;

  SELECT count(*) INTO v_remaining
  FROM public.meter_power_readings_5min m5
  WHERE m5.meter_id IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM public.meters m WHERE m.id = m5.meter_id);

  IF v_remaining <> 0 THEN
    RAISE EXCEPTION 'Preflight fehlgeschlagen: % verwaiste Zuordnungen verbleiben', v_remaining;
  END IF;
END
$cleanup$;

DO $publication$
DECLARE
  v_relation regclass;
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_publication
    WHERE pubname = 'supabase_realtime' AND NOT puballtables
  ) THEN
    IF to_regclass('public.meter_power_readings_5min_legacy') IS NOT NULL
       AND EXISTS (
         SELECT 1 FROM pg_publication_rel pr
         JOIN pg_publication p ON p.oid = pr.prpubid
         WHERE p.pubname = 'supabase_realtime'
           AND pr.prrelid = 'public.meter_power_readings_5min_legacy'::regclass
       ) THEN
      ALTER PUBLICATION supabase_realtime DROP TABLE public.meter_power_readings_5min_legacy;
    END IF;

    FOR v_relation IN
      SELECT pt.relid
      FROM pg_partition_tree('public.meter_power_readings_5min'::regclass) pt
      JOIN pg_publication_rel pr ON pr.prrelid = pt.relid
      JOIN pg_publication p ON p.oid = pr.prpubid
      WHERE pt.isleaf AND p.pubname = 'supabase_realtime'
    LOOP
      EXECUTE format('ALTER PUBLICATION supabase_realtime DROP TABLE %s', v_relation);
    END LOOP;

    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_rel pr
      JOIN pg_publication p ON p.oid = pr.prpubid
      WHERE p.pubname = 'supabase_realtime'
        AND pr.prrelid = 'public.meter_power_readings_5min'::regclass
    ) THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.meter_power_readings_5min;
    END IF;
  END IF;
END
$publication$;

CREATE OR REPLACE FUNCTION public.preserve_detached_5min_history()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
BEGIN
  IF OLD.meter_id IS NULL THEN
    RETURN NULL;
  END IF;
  RETURN OLD;
END;
$function$;

DROP TRIGGER IF EXISTS preserve_detached_5min_history_before_delete
ON public.meter_power_readings_5min;
CREATE TRIGGER preserve_detached_5min_history_before_delete
BEFORE DELETE ON public.meter_power_readings_5min
FOR EACH ROW EXECUTE FUNCTION public.preserve_detached_5min_history();

CREATE OR REPLACE FUNCTION public.refresh_meter_period_totals_5min(
  p_from date DEFAULT CURRENT_DATE,
  p_to date DEFAULT CURRENT_DATE
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_day_rows integer := 0;
BEGIN
  WITH agg AS (
    SELECT m5.tenant_id, m5.meter_id, MAX(m5.energy_type) AS energy_type,
           (m5.bucket AT TIME ZONE 'Europe/Berlin')::date AS day,
           COALESCE(SUM(m5.power_avg * (m5.resolution_minutes / 60.0)), 0)::numeric AS total_value
    FROM public.meter_power_readings_5min m5
    WHERE m5.bucket >= (p_from::timestamp AT TIME ZONE 'Europe/Berlin')
      AND m5.bucket < ((p_to + 1)::timestamp AT TIME ZONE 'Europe/Berlin')
      AND m5.meter_id IS NOT NULL
      AND EXISTS (SELECT 1 FROM public.meters m WHERE m.id = m5.meter_id)
    GROUP BY m5.tenant_id, m5.meter_id, (m5.bucket AT TIME ZONE 'Europe/Berlin')::date
  ), filtered AS (
    SELECT a.* FROM agg a
    WHERE NOT EXISTS (
      SELECT 1 FROM public.meter_period_totals mpt
      WHERE mpt.period_type = 'day' AND mpt.meter_id = a.meter_id
        AND mpt.period_start = a.day
        AND mpt.source IN ('loxone','loxone_live','loxone_backfill','manual','smart_meter_mscons')
    )
  ), upsert_day AS (
    INSERT INTO public.meter_period_totals AS mpt
      (tenant_id, meter_id, period_type, period_start, total_value, energy_type, source)
    SELECT tenant_id, meter_id, 'day', day, total_value, energy_type, 'computed_5min'
    FROM filtered
    ON CONFLICT (meter_id, period_type, period_start) DO UPDATE SET
      total_value = EXCLUDED.total_value,
      energy_type = EXCLUDED.energy_type,
      source = 'computed_5min',
      updated_at = now()
    WHERE mpt.source NOT IN ('loxone','loxone_live','loxone_backfill','manual','smart_meter_mscons')
      AND (mpt.total_value IS DISTINCT FROM EXCLUDED.total_value
        OR mpt.energy_type IS DISTINCT FROM EXCLUDED.energy_type
        OR mpt.source IS DISTINCT FROM 'computed_5min')
    RETURNING 1
  )
  SELECT COUNT(*) INTO v_day_rows FROM upsert_day;
  RETURN v_day_rows;
END;
$function$;

REVOKE ALL ON FUNCTION public.refresh_meter_period_totals_5min(date,date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.refresh_meter_period_totals_5min(date,date) TO service_role;

CREATE OR REPLACE FUNCTION public.ensure_meter_power_5min_partitions(
  p_months_ahead integer DEFAULT 3
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_parent text;
  v_from date;
  v_to date;
  v_d date;
  v_name text;
  v_created integer := 0;
BEGIN
  SELECT c.relname INTO v_parent
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relkind = 'p'
    AND c.relname IN ('meter_power_readings_5min', 'meter_power_readings_5min_part')
  ORDER BY (c.relname = 'meter_power_readings_5min') DESC
  LIMIT 1;

  IF v_parent IS NULL THEN RETURN 0; END IF;

  EXECUTE format(
    'SELECT date_trunc(''month'', COALESCE(min(bucket), now()))::date FROM public.%I', v_parent
  ) INTO v_from;
  v_to := (date_trunc('month', now()) + make_interval(months => GREATEST(p_months_ahead, 1)))::date;
  v_d := LEAST(v_from, date_trunc('month', now())::date);

  WHILE v_d <= v_to LOOP
    v_name := 'meter_power_readings_5min_p_' || to_char(v_d, 'YYYYMM');
    IF to_regclass(format('public.%I', v_name)) IS NULL THEN
      BEGIN
        EXECUTE format(
          'CREATE TABLE public.%I PARTITION OF public.%I FOR VALUES FROM (%L) TO (%L)',
          v_name, v_parent, v_d, (v_d + interval '1 month')::date
        );
        EXECUTE format('ALTER TABLE public.%I REPLICA IDENTITY FULL', v_name);
        EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', v_name);
        EXECUTE format('REVOKE ALL ON public.%I FROM anon, authenticated', v_name);
        EXECUTE format('GRANT ALL ON public.%I TO service_role', v_name);
        v_created := v_created + 1;
        RAISE NOTICE 'Partition % erstellt und gehaertet', v_name;
      EXCEPTION WHEN others THEN
        RAISE NOTICE 'Partition % konnte nicht angelegt werden: %', v_name, SQLERRM;
      END;
    ELSE
      EXECUTE format('ALTER TABLE public.%I REPLICA IDENTITY FULL', v_name);
    END IF;
    v_d := (v_d + interval '1 month')::date;
  END LOOP;
  RETURN v_created;
END
$function$;

REVOKE ALL ON FUNCTION public.ensure_meter_power_5min_partitions(integer) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ensure_meter_power_5min_partitions(integer) TO service_role;

DO $verify$
DECLARE
  v_bad_identity bigint;
  v_orphans bigint;
BEGIN
  SELECT count(*) INTO v_bad_identity
  FROM pg_partition_tree('public.meter_power_readings_5min'::regclass) pt
  JOIN pg_class c ON c.oid = pt.relid
  WHERE c.relreplident <> 'f';

  SELECT count(*) INTO v_orphans
  FROM public.meter_power_readings_5min m5
  WHERE m5.meter_id IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM public.meters m WHERE m.id = m5.meter_id);

  IF v_bad_identity <> 0 OR v_orphans <> 0 THEN
    RAISE EXCEPTION '5min-Haertung fehlgeschlagen: replica_identity_drift=%, orphans=%', v_bad_identity, v_orphans;
  END IF;
END
$verify$;