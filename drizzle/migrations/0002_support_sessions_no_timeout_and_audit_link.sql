ALTER TABLE public.audit_logs ADD COLUMN IF NOT EXISTS support_session_id uuid REFERENCES public.support_sessions(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_audit_logs_support_session ON public.audit_logs(support_session_id) WHERE support_session_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.end_support_sessions_on_disable()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF COALESCE(OLD.remote_support_enabled, false) = true AND COALESCE(NEW.remote_support_enabled, false) = false THEN
    UPDATE public.support_sessions SET ended_at = now()
    WHERE tenant_id = NEW.id AND ended_at IS NULL AND COALESCE(is_manual, false) = false;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_end_support_sessions_on_disable ON public.tenants;
CREATE TRIGGER trg_end_support_sessions_on_disable
AFTER UPDATE OF remote_support_enabled ON public.tenants
FOR EACH ROW EXECUTE FUNCTION public.end_support_sessions_on_disable();

CREATE OR REPLACE FUNCTION public.close_stale_support_sessions()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE n integer;
BEGIN
  UPDATE public.support_sessions SET ended_at = expires_at
  WHERE ended_at IS NULL AND expires_at < now();
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END $$;
REVOKE ALL ON FUNCTION public.close_stale_support_sessions() FROM PUBLIC, anon, authenticated;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname = 'close-stale-support-sessions';
    PERFORM cron.schedule('close-stale-support-sessions', '17 * * * *', 'SELECT public.close_stale_support_sessions()');
  END IF;
END $$;