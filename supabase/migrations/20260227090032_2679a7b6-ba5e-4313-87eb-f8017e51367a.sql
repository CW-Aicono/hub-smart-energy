
-- backup_snapshots table
CREATE TABLE public.backup_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  backup_type TEXT NOT NULL DEFAULT 'manual',
  status TEXT NOT NULL DEFAULT 'completed',
  tables_count INTEGER NOT NULL DEFAULT 0,
  rows_count INTEGER NOT NULL DEFAULT 0,
  size_bytes BIGINT NOT NULL DEFAULT 0,
  data JSONB,
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '30 days'),
  error_message TEXT
);

ALTER TABLE public.backup_snapshots ENABLE ROW LEVEL SECURITY;

-- Admins of the same tenant can read
CREATE POLICY "Tenant admins can read own backups"
  ON public.backup_snapshots FOR SELECT
  TO authenticated
  USING (
    tenant_id = public.get_user_tenant_id()
    AND public.has_role(auth.uid(), 'admin'::public.app_role)
  );

-- Admins of the same tenant can insert
CREATE POLICY "Tenant admins can create backups"
  ON public.backup_snapshots FOR INSERT
  TO authenticated
  WITH CHECK (
    tenant_id = public.get_user_tenant_id()
    AND public.has_role(auth.uid(), 'admin'::public.app_role)
  );

-- Admins of the same tenant can delete
CREATE POLICY "Tenant admins can delete own backups"
  ON public.backup_snapshots FOR DELETE
  TO authenticated
  USING (
    tenant_id = public.get_user_tenant_id()
    AND public.has_role(auth.uid(), 'admin'::public.app_role)
  );

-- Service role can do everything (for scheduled backups and cleanup)
CREATE POLICY "Service role full access"
  ON public.backup_snapshots FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Index for efficient queries
CREATE INDEX idx_backup_snapshots_tenant_id ON public.backup_snapshots(tenant_id);
CREATE INDEX idx_backup_snapshots_expires_at ON public.backup_snapshots(expires_at);

-- Cleanup function for expired snapshots
CREATE OR REPLACE FUNCTION public.cleanup_expired_backups()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_deleted integer;
BEGIN
  DELETE FROM public.backup_snapshots WHERE expires_at < now();
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$$;
