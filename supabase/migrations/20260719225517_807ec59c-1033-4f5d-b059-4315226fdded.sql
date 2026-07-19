
CREATE TABLE public.loxone_pending_writes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL,
  location_integration_id UUID NOT NULL REFERENCES public.location_integrations(id) ON DELETE CASCADE,
  template_key TEXT NOT NULL,
  instance INTEGER NOT NULL DEFAULT 1,
  parameter TEXT NOT NULL,
  target_uuid TEXT,
  value_num NUMERIC,
  value_bool BOOLEAN,
  source TEXT NOT NULL DEFAULT 'cloud',
  priority SMALLINT NOT NULL DEFAULT 5,
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','sent','failed','expired','skipped')),
  attempts INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 3,
  error_message TEXT,
  requested_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  sent_at TIMESTAMPTZ,
  acked_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + INTERVAL '10 minutes'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_loxone_pending_writes_queue
  ON public.loxone_pending_writes (status, priority, requested_at)
  WHERE status = 'queued';
CREATE INDEX idx_loxone_pending_writes_integration
  ON public.loxone_pending_writes (location_integration_id, status);
CREATE INDEX idx_loxone_pending_writes_tenant
  ON public.loxone_pending_writes (tenant_id, requested_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.loxone_pending_writes TO authenticated;
GRANT ALL ON public.loxone_pending_writes TO service_role;

ALTER TABLE public.loxone_pending_writes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "loxone_pending_writes_read"
  ON public.loxone_pending_writes
  FOR SELECT
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'super_admin')
    OR tenant_id IN (SELECT p.tenant_id FROM public.profiles p WHERE p.user_id = auth.uid())
  );

CREATE POLICY "loxone_pending_writes_manage"
  ON public.loxone_pending_writes
  FOR ALL
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'super_admin')
    OR tenant_id IN (SELECT p.tenant_id FROM public.profiles p WHERE p.user_id = auth.uid())
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'super_admin')
    OR tenant_id IN (SELECT p.tenant_id FROM public.profiles p WHERE p.user_id = auth.uid())
  );

CREATE TRIGGER trg_loxone_pending_writes_updated_at
  BEFORE UPDATE ON public.loxone_pending_writes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.cleanup_loxone_pending_writes()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE deleted INTEGER;
BEGIN
  UPDATE public.loxone_pending_writes
     SET status = 'expired'
   WHERE status = 'queued' AND expires_at < now();

  DELETE FROM public.loxone_pending_writes
   WHERE status IN ('sent','failed','expired','skipped')
     AND updated_at < now() - INTERVAL '7 days';
  GET DIAGNOSTICS deleted = ROW_COUNT;
  RETURN deleted;
END;
$$;
