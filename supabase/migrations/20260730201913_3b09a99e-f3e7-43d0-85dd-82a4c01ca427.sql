-- 1) Wartungsfunktion: fehlende Monats-Partitionen anlegen
CREATE OR REPLACE FUNCTION public.ensure_meter_power_5min_partitions(
  p_months_ahead integer DEFAULT 3
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
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
  WHERE n.nspname = 'public'
    AND c.relkind = 'p'
    AND c.relname IN ('meter_power_readings_5min', 'meter_power_readings_5min_part')
  ORDER BY (c.relname = 'meter_power_readings_5min') DESC
  LIMIT 1;

  IF v_parent IS NULL THEN
    RETURN 0;
  END IF;

  EXECUTE format(
    'SELECT date_trunc(''month'', COALESCE(min(bucket), now()))::date FROM public.%I', v_parent
  ) INTO v_from;

  v_to := (date_trunc('month', now()) + make_interval(months => GREATEST(p_months_ahead, 1)))::date;
  v_d := LEAST(v_from, date_trunc('month', now())::date);

  WHILE v_d <= v_to LOOP
    v_name := 'meter_power_readings_5min_p_' || to_char(v_d, 'YYYYMM');
    IF NOT EXISTS (
      SELECT 1 FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = v_name
    ) THEN
      BEGIN
        EXECUTE format(
          'CREATE TABLE public.%I PARTITION OF public.%I FOR VALUES FROM (%L) TO (%L)',
          v_name, v_parent, v_d, (v_d + interval '1 month')::date
        );
        v_created := v_created + 1;
      EXCEPTION WHEN others THEN
        -- z.B. weil Zeilen bereits in der DEFAULT-Partition liegen: still ueberspringen
        RAISE NOTICE 'Partition % konnte nicht angelegt werden: %', v_name, SQLERRM;
      END;
    END IF;
    v_d := (v_d + interval '1 month')::date;
  END LOOP;

  RETURN v_created;
END
$fn$;

REVOKE ALL ON FUNCTION public.ensure_meter_power_5min_partitions(integer) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ensure_meter_power_5min_partitions(integer) TO service_role;

-- 2) Idempotenter, batchweiser Swap (No-Op, wenn bereits partitioniert)
DO $swap$
DECLARE
  v_is_partitioned boolean;
  v_part_exists boolean;
  v_from timestamptz;
  v_to timestamptz;
  v_cursor timestamptz;
  v_copied bigint := 0;
  v_batch bigint;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'meter_power_readings_5min_part'
  ) INTO v_part_exists;

  SELECT COALESCE((
    SELECT c.relkind = 'p' FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'meter_power_readings_5min'
  ), false) INTO v_is_partitioned;

  IF v_is_partitioned OR NOT v_part_exists THEN
    RAISE NOTICE 'Swap bereits erfolgt oder Partitionstabelle nicht vorhanden - uebersprungen.';
    RETURN;
  END IF;

  SET LOCAL statement_timeout = 0;
  SET LOCAL lock_timeout = '5min';

  LOCK TABLE public.meter_power_readings_5min IN ACCESS EXCLUSIVE MODE;
  LOCK TABLE public.meter_power_readings_5min_part IN ACCESS EXCLUSIVE MODE;

  SELECT date_trunc('month', COALESCE(min(bucket), now())),
         date_trunc('month', COALESCE(max(bucket), now())) + interval '1 month'
    INTO v_from, v_to
    FROM public.meter_power_readings_5min;

  v_cursor := v_from;
  WHILE v_cursor < v_to LOOP
    INSERT INTO public.meter_power_readings_5min_part
      (id, meter_id, tenant_id, energy_type, power_avg, power_max, bucket,
       sample_count, created_at, resolution_minutes, source)
    SELECT o.id, o.meter_id, o.tenant_id, o.energy_type, o.power_avg, o.power_max, o.bucket,
           o.sample_count, o.created_at, o.resolution_minutes, o.source
    FROM public.meter_power_readings_5min o
    WHERE o.bucket >= v_cursor AND o.bucket < v_cursor + interval '1 month'
    ON CONFLICT DO NOTHING;

    GET DIAGNOSTICS v_batch = ROW_COUNT;
    v_copied := v_copied + v_batch;
    RAISE NOTICE 'Kopiert % Zeilen fuer Monat %', v_batch, to_char(v_cursor, 'YYYY-MM');
    v_cursor := v_cursor + interval '1 month';
  END LOOP;

  RAISE NOTICE 'Gesamt kopiert: % Zeilen', v_copied;

  EXECUTE 'ALTER TABLE public.meter_power_readings_5min RENAME TO meter_power_readings_5min_legacy';
  EXECUTE 'ALTER TABLE public.meter_power_readings_5min_part RENAME TO meter_power_readings_5min';
  EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON public.meter_power_readings_5min TO authenticated';
  EXECUTE 'GRANT ALL ON public.meter_power_readings_5min TO service_role';
END
$swap$;

-- 3) Fehlende Partitionen sofort sicherstellen
SELECT public.ensure_meter_power_5min_partitions(3);

-- 4) Naechtlicher Wartungsjob (gestaffelte Minute, siehe Cron-Policy)
DO $cron$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule('ems-ensure-power-partitions')
      WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'ems-ensure-power-partitions');
    PERFORM cron.schedule(
      'ems-ensure-power-partitions',
      '25 3 * * *',
      'SELECT public.ensure_meter_power_5min_partitions(3)'
    );
  END IF;
END
$cron$;