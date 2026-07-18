
-- =========================================================================
-- 1. Alert-Event Tabelle (Historie)
-- =========================================================================
CREATE TABLE IF NOT EXISTS public.monitoring_alert_events (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_id         uuid REFERENCES public.monitoring_alert_rules(id) ON DELETE SET NULL,
  metric_category text NOT NULL,
  metric_name     text NOT NULL,
  metric_value    numeric NOT NULL,
  threshold       numeric NOT NULL,
  comparator      text NOT NULL,
  severity        text NOT NULL,
  message         text,
  triggered_at    timestamptz NOT NULL DEFAULT now(),
  resolved_at     timestamptz,
  resolved_value  numeric,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_mae_triggered ON public.monitoring_alert_events (triggered_at DESC);
CREATE INDEX IF NOT EXISTS idx_mae_open ON public.monitoring_alert_events (rule_id) WHERE resolved_at IS NULL;

GRANT SELECT ON public.monitoring_alert_events TO authenticated;
GRANT ALL    ON public.monitoring_alert_events TO service_role;

ALTER TABLE public.monitoring_alert_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admins can read alert events"
  ON public.monitoring_alert_events FOR SELECT
  TO authenticated
  USING (has_role(auth.uid(), 'super_admin'::app_role));

-- =========================================================================
-- 2. collect_db_metrics erweitern (WAL, Cache-Hit-Ratio, IO)
-- =========================================================================
CREATE OR REPLACE FUNCTION public.collect_db_metrics()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result jsonb;
  v_active_connections integer;
  v_max_connections integer;
  v_db_size bigint;
  v_table_count integer;
  v_wal_bytes bigint;
  v_cache_hit_ratio numeric;
  v_blks_read bigint;
  v_blks_hit bigint;
  v_tup_ins bigint;
  v_tup_upd bigint;
  v_tup_del bigint;
BEGIN
  SELECT count(*) INTO v_active_connections FROM pg_stat_activity WHERE state = 'active';
  SELECT setting::integer INTO v_max_connections FROM pg_settings WHERE name = 'max_connections';
  SELECT pg_database_size(current_database()) INTO v_db_size;
  SELECT count(*) INTO v_table_count FROM information_schema.tables WHERE table_schema = 'public';

  -- WAL-Größe (Summe der WAL-Segmente)
  BEGIN
    SELECT COALESCE(SUM(size), 0)::bigint INTO v_wal_bytes FROM pg_ls_waldir();
  EXCEPTION WHEN OTHERS THEN
    v_wal_bytes := 0;
  END;

  -- IO-Zähler + Cache-Hit-Ratio aus pg_stat_database (kumulativ seit Boot)
  SELECT
    COALESCE(blks_read, 0),
    COALESCE(blks_hit, 0),
    COALESCE(tup_inserted, 0),
    COALESCE(tup_updated, 0),
    COALESCE(tup_deleted, 0)
  INTO v_blks_read, v_blks_hit, v_tup_ins, v_tup_upd, v_tup_del
  FROM pg_stat_database
  WHERE datname = current_database();

  v_cache_hit_ratio := CASE
    WHEN (v_blks_hit + v_blks_read) > 0
      THEN ROUND((v_blks_hit::numeric / (v_blks_hit + v_blks_read)) * 100, 2)
    ELSE 100
  END;

  INSERT INTO infrastructure_metrics (metric_type, metric_name, metric_value, metadata) VALUES
    ('db_connections', 'active_connections',  v_active_connections, '{}'::jsonb),
    ('db_connections', 'max_connections',     v_max_connections,    '{}'::jsonb),
    ('disk_usage',     'database_size_bytes', v_db_size,            '{}'::jsonb),
    ('db_info',        'table_count',         v_table_count,        '{}'::jsonb),
    ('wal',            'current_size_bytes',  v_wal_bytes,          '{}'::jsonb),
    ('memory',         'cache_hit_ratio_pct', v_cache_hit_ratio,    '{}'::jsonb),
    ('db_io',          'blks_read_total',     v_blks_read,          '{}'::jsonb),
    ('db_io',          'blks_hit_total',      v_blks_hit,           '{}'::jsonb),
    ('db_io',          'tup_inserted_total',  v_tup_ins,            '{}'::jsonb),
    ('db_io',          'tup_updated_total',   v_tup_upd,            '{}'::jsonb),
    ('db_io',          'tup_deleted_total',   v_tup_del,            '{}'::jsonb);

  INSERT INTO infrastructure_metrics (metric_type, metric_name, metric_value, metadata)
  SELECT 'table_size', relname::text, pg_total_relation_size(c.oid)::double precision,
    jsonb_build_object('schema', n.nspname)
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relkind = 'r'
  ORDER BY pg_total_relation_size(c.oid) DESC
  LIMIT 10;

  v_result := jsonb_build_object(
    'active_connections',  v_active_connections,
    'max_connections',     v_max_connections,
    'database_size_bytes', v_db_size,
    'table_count',         v_table_count,
    'wal_bytes',           v_wal_bytes,
    'cache_hit_ratio_pct', v_cache_hit_ratio
  );

  PERFORM cleanup_old_infra_metrics();

  RETURN v_result;
END;
$$;

-- =========================================================================
-- 3. Regel-Auswertung
-- =========================================================================
CREATE OR REPLACE FUNCTION public.evaluate_monitoring_rules()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r RECORD;
  v_value numeric;
  v_violated boolean;
  v_open_id uuid;
  v_events integer := 0;
  v_msg text;
BEGIN
  FOR r IN
    SELECT * FROM public.monitoring_alert_rules WHERE enabled = true
  LOOP
    -- Neuesten Metrikwert holen
    SELECT metric_value INTO v_value
    FROM public.infrastructure_metrics
    WHERE metric_type = r.metric_category
      AND metric_name = r.metric_name
    ORDER BY recorded_at DESC
    LIMIT 1;

    IF v_value IS NULL THEN
      CONTINUE;
    END IF;

    v_violated := CASE r.comparator
      WHEN '>'  THEN v_value >  r.threshold
      WHEN '>=' THEN v_value >= r.threshold
      WHEN '<'  THEN v_value <  r.threshold
      WHEN '<=' THEN v_value <= r.threshold
      ELSE false
    END;

    SELECT id INTO v_open_id
    FROM public.monitoring_alert_events
    WHERE rule_id = r.id AND resolved_at IS NULL
    ORDER BY triggered_at DESC
    LIMIT 1;

    IF v_violated AND v_open_id IS NULL THEN
      v_msg := format('%s.%s = %s %s %s (%s)',
        r.metric_category, r.metric_name,
        v_value::text, r.comparator, r.threshold::text, r.severity);
      INSERT INTO public.monitoring_alert_events
        (rule_id, metric_category, metric_name, metric_value, threshold, comparator, severity, message)
      VALUES
        (r.id, r.metric_category, r.metric_name, v_value, r.threshold, r.comparator, r.severity, v_msg);
      v_events := v_events + 1;
    ELSIF (NOT v_violated) AND v_open_id IS NOT NULL THEN
      UPDATE public.monitoring_alert_events
        SET resolved_at = now(), resolved_value = v_value
        WHERE id = v_open_id;
      v_events := v_events + 1;
    END IF;
  END LOOP;

  RETURN v_events;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.evaluate_monitoring_rules() FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.evaluate_monitoring_rules() TO service_role;

-- =========================================================================
-- 4. Cron-Jobs (5 Minuten)
-- =========================================================================
DO $$
BEGIN
  -- Vorherige Jobs entfernen, falls vorhanden
  PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname IN (
    'monitoring-collect-5min', 'monitoring-evaluate-5min'
  );
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

SELECT cron.schedule(
  'monitoring-collect-5min',
  '*/5 * * * *',
  $$SELECT public.collect_db_metrics();$$
);

SELECT cron.schedule(
  'monitoring-evaluate-5min',
  '*/5 * * * *',
  $$SELECT public.evaluate_monitoring_rules();$$
);

-- =========================================================================
-- 5. Standard-Regeln seeden (unique key: category+name+comparator)
-- =========================================================================
INSERT INTO public.monitoring_alert_rules
  (metric_category, metric_name, comparator, threshold, severity, enabled)
VALUES
  ('db_connections', 'active_connections',  '>',  48,         'warning',  true),  -- 80% von 60
  ('db_connections', 'active_connections',  '>=', 57,         'critical', true),  -- 95% von 60
  ('wal',            'current_size_bytes',  '>',  1073741824, 'warning',  true),  -- 1 GB
  ('wal',            'current_size_bytes',  '>=', 2147483648, 'critical', true),  -- 2 GB
  ('memory',         'cache_hit_ratio_pct', '<',  95,         'warning',  true),
  ('memory',         'cache_hit_ratio_pct', '<',  90,         'critical', true),
  ('disk_usage',     'database_size_bytes', '>',  5368709120, 'warning',  true),  -- 5 GB
  ('disk_usage',     'database_size_bytes', '>=', 10737418240,'critical', true)   -- 10 GB
ON CONFLICT (metric_category, metric_name, comparator) DO NOTHING;

-- Einmal sofort ausführen, damit erste Werte vorliegen
SELECT public.collect_db_metrics();
SELECT public.evaluate_monitoring_rules();
