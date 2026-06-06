
CREATE TABLE public.audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  actor_user_id uuid,
  actor_email text,
  actor_role text,
  tenant_id uuid,
  partner_id uuid,
  action text NOT NULL,
  entity_type text NOT NULL,
  entity_id uuid,
  entity_label text,
  before jsonb,
  after jsonb,
  metadata jsonb,
  ip_address inet,
  user_agent text
);

GRANT SELECT ON public.audit_logs TO authenticated;
GRANT ALL ON public.audit_logs TO service_role;

ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- Super-Admin: alles lesen
CREATE POLICY "Super admins read all audit logs"
ON public.audit_logs FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'super_admin'::public.app_role));

-- Tenant-Admin: nur eigener Tenant
CREATE POLICY "Tenant admins read own tenant audit logs"
ON public.audit_logs FOR SELECT
TO authenticated
USING (
  tenant_id IS NOT NULL
  AND tenant_id = public.get_user_tenant_id()
  AND public.has_role(auth.uid(), 'admin'::public.app_role)
);

-- Partner-Member: eigener Partner ODER Tenants dieses Partners
CREATE POLICY "Partner members read partner audit logs"
ON public.audit_logs FOR SELECT
TO authenticated
USING (
  (partner_id IS NOT NULL AND public.is_partner_member(auth.uid(), partner_id))
  OR (
    tenant_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.tenants t
      WHERE t.id = audit_logs.tenant_id
        AND t.partner_id IS NOT NULL
        AND public.is_partner_member(auth.uid(), t.partner_id)
    )
  )
);

CREATE INDEX idx_audit_logs_tenant_created ON public.audit_logs (tenant_id, created_at DESC);
CREATE INDEX idx_audit_logs_partner_created ON public.audit_logs (partner_id, created_at DESC);
CREATE INDEX idx_audit_logs_action_created ON public.audit_logs (action, created_at DESC);
CREATE INDEX idx_audit_logs_entity ON public.audit_logs (entity_type, entity_id);
CREATE INDEX idx_audit_logs_created_at ON public.audit_logs (created_at DESC);

-- Retention: löscht Einträge älter als 365 Tage
CREATE OR REPLACE FUNCTION public.cleanup_old_audit_logs()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE v_deleted integer;
BEGIN
  DELETE FROM public.audit_logs WHERE created_at < now() - interval '365 days';
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$$;

-- Cron: monatlich am 1. um 03:30
SELECT cron.schedule(
  'cleanup-audit-logs-monthly',
  '30 3 1 * *',
  $$SELECT public.cleanup_old_audit_logs();$$
);
