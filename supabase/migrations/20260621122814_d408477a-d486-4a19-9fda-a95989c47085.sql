CREATE OR REPLACE FUNCTION public.admin_top_disk_readers(limit_n int DEFAULT 20)
RETURNS TABLE (
  rolname text,
  calls bigint,
  mean_ms numeric,
  total_ms numeric,
  shared_blks_read bigint,
  shared_blks_hit bigint,
  read_ratio numeric,
  query text
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
  SELECT
    r.rolname::text,
    s.calls,
    round(s.mean_exec_time::numeric, 1) AS mean_ms,
    round(s.total_exec_time::numeric, 0) AS total_ms,
    s.shared_blks_read,
    s.shared_blks_hit,
    round((s.shared_blks_read::numeric / NULLIF(s.shared_blks_read + s.shared_blks_hit, 0)), 4) AS read_ratio,
    s.query
  FROM extensions.pg_stat_statements s
  LEFT JOIN pg_roles r ON r.oid = s.userid
  ORDER BY s.shared_blks_read DESC
  LIMIT limit_n;
$$;

REVOKE ALL ON FUNCTION public.admin_top_disk_readers(int) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_top_disk_readers(int) TO postgres, service_role;