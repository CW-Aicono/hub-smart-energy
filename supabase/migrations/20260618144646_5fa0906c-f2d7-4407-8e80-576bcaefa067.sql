-- Feature-Flag für Loxone Remote-Connect WebSocket-Test
ALTER TABLE public.location_integrations
  ADD COLUMN IF NOT EXISTS loxone_remote_connect_ws_enabled BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN public.location_integrations.loxone_remote_connect_ws_enabled IS
  'Feldtest: wenn TRUE, baut der Loxone-WS-Worker eine persistente WebSocket-Verbindung über Loxone Remote Connect (dns.loxonecloud.com) auf. Polling läuft als Fallback weiter.';

-- Session-Log für Monitoring der WS-Verbindungen
CREATE TABLE IF NOT EXISTS public.loxone_ws_session_log (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  location_integration_id UUID NOT NULL REFERENCES public.location_integrations(id) ON DELETE CASCADE,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ended_at TIMESTAMPTZ,
  disconnect_reason TEXT,
  events_received INTEGER NOT NULL DEFAULT 0,
  reconnect_count INTEGER NOT NULL DEFAULT 0,
  worker_host TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_loxone_ws_session_log_tenant ON public.loxone_ws_session_log(tenant_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_loxone_ws_session_log_integration ON public.loxone_ws_session_log(location_integration_id, started_at DESC);

GRANT SELECT ON public.loxone_ws_session_log TO authenticated;
GRANT ALL ON public.loxone_ws_session_log TO service_role;

ALTER TABLE public.loxone_ws_session_log ENABLE ROW LEVEL SECURITY;

-- Tenant-User dürfen ihre eigenen Sessions lesen
CREATE POLICY "Tenant users can view own ws sessions"
  ON public.loxone_ws_session_log
  FOR SELECT
  TO authenticated
  USING (
    tenant_id IN (
      SELECT tenant_id FROM public.profiles WHERE id = auth.uid()
    )
  );

-- Super-Admins sehen alles
CREATE POLICY "Super admins can view all ws sessions"
  ON public.loxone_ws_session_log
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'::app_role));

-- updated_at-Trigger
CREATE TRIGGER update_loxone_ws_session_log_updated_at
  BEFORE UPDATE ON public.loxone_ws_session_log
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();