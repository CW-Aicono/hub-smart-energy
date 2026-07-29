CREATE OR REPLACE FUNCTION public.collect_db_metrics()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
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
  v_emergency_mode boolean := false;
BEGIN
  SELECT COALESCE(lower(value) IN ('true', '1', 'on', 'yes'), false)
    INTO v_emergency_mode
  FROM public.system_settings
  WHERE key = 'backend_emergency_mode';

  IF COALESCE(v_emergency_mode, false) IS TRUE THEN
    RETURN jsonb_build_object('success', true, 'skipped', 'backend_emergency_mode');
  END IF;

  SELECT count(*) INTO v_active_connections FROM pg_stat_activity WHERE state = 'active';
  SELECT setting::integer INTO v_max_connections FROM pg_settings WHERE name = 'max_connections';
  SELECT pg_database_size(current_database()) INTO v_db_size;
  SELECT count(*) INTO v_table_count FROM information_schema.tables WHERE table_schema = 'public';

  BEGIN
    SELECT COALESCE(SUM(size), 0)::bigint INTO v_wal_bytes FROM pg_ls_waldir();
  EXCEPTION WHEN OTHERS THEN
    v_wal_bytes := 0;
  END;

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