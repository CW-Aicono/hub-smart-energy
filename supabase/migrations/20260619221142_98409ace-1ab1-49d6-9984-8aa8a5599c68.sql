
-- =====================================================================
-- Phase 1: Bridge-Worker Architektur (Variante B) – DB-Schema
-- =====================================================================

-- ---------- Enum-Typen ----------
CREATE TYPE public.bridge_worker_status AS ENUM ('online', 'degraded', 'offline', 'disabled');
CREATE TYPE public.bridge_connection_kind AS ENUM ('lan', 'cloud_dns', 'remote_connect');
CREATE TYPE public.bridge_event_severity AS ENUM ('debug', 'info', 'warn', 'error');

-- ---------- 1. bridge_workers ----------
CREATE TABLE public.bridge_workers (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name            TEXT NOT NULL UNIQUE,
  description     TEXT,
  host            TEXT,
  version         TEXT,
  status          public.bridge_worker_status NOT NULL DEFAULT 'offline',
  last_heartbeat_at TIMESTAMPTZ,
  last_error      TEXT,
  enabled         BOOLEAN NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT ON public.bridge_workers TO authenticated;
GRANT ALL    ON public.bridge_workers TO service_role;

ALTER TABLE public.bridge_workers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admins manage bridge_workers"
  ON public.bridge_workers FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'));

CREATE POLICY "Authenticated users can read bridge_workers"
  ON public.bridge_workers FOR SELECT TO authenticated
  USING (true);

-- ---------- 2. bridge_miniserver_links ----------
CREATE TABLE public.bridge_miniserver_links (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  worker_id          UUID NOT NULL REFERENCES public.bridge_workers(id) ON DELETE CASCADE,
  tenant_id          UUID REFERENCES public.tenants(id) ON DELETE CASCADE,
  location_id        UUID REFERENCES public.locations(id) ON DELETE SET NULL,
  miniserver_serial  TEXT NOT NULL,
  miniserver_generation SMALLINT NOT NULL DEFAULT 2,
  firmware           TEXT,
  connection_kind    public.bridge_connection_kind NOT NULL DEFAULT 'remote_connect',
  endpoint           TEXT,
  credentials_encrypted TEXT,
  subscribed_uuids   JSONB NOT NULL DEFAULT '[]'::jsonb,
  enabled            BOOLEAN NOT NULL DEFAULT true,
  last_connected_at  TIMESTAMPTZ,
  last_event_at      TIMESTAMPTZ,
  notes              TEXT,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (worker_id, miniserver_serial)
);

CREATE INDEX idx_bridge_links_tenant   ON public.bridge_miniserver_links(tenant_id);
CREATE INDEX idx_bridge_links_location ON public.bridge_miniserver_links(location_id);
CREATE INDEX idx_bridge_links_worker   ON public.bridge_miniserver_links(worker_id);

GRANT SELECT ON public.bridge_miniserver_links TO authenticated;
GRANT ALL    ON public.bridge_miniserver_links TO service_role;

ALTER TABLE public.bridge_miniserver_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admins manage bridge_miniserver_links"
  ON public.bridge_miniserver_links FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'));

CREATE POLICY "Tenant members read their bridge_miniserver_links"
  ON public.bridge_miniserver_links FOR SELECT TO authenticated
  USING (
    tenant_id IS NOT NULL
    AND tenant_id IN (
      SELECT p.tenant_id FROM public.profiles p WHERE p.id = auth.uid()
    )
  );

-- ---------- 3. bridge_event_log ----------
CREATE TABLE public.bridge_event_log (
  id            BIGSERIAL PRIMARY KEY,
  occurred_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  worker_id     UUID REFERENCES public.bridge_workers(id) ON DELETE CASCADE,
  link_id       UUID REFERENCES public.bridge_miniserver_links(id) ON DELETE CASCADE,
  tenant_id     UUID REFERENCES public.tenants(id) ON DELETE CASCADE,
  severity      public.bridge_event_severity NOT NULL DEFAULT 'info',
  event_type    TEXT NOT NULL,
  message       TEXT,
  details       JSONB
);

CREATE INDEX idx_bridge_event_log_occurred ON public.bridge_event_log(occurred_at DESC);
CREATE INDEX idx_bridge_event_log_worker   ON public.bridge_event_log(worker_id, occurred_at DESC);
CREATE INDEX idx_bridge_event_log_link     ON public.bridge_event_log(link_id, occurred_at DESC);
CREATE INDEX idx_bridge_event_log_tenant   ON public.bridge_event_log(tenant_id, occurred_at DESC);

GRANT SELECT ON public.bridge_event_log TO authenticated;
GRANT ALL    ON public.bridge_event_log TO service_role;

ALTER TABLE public.bridge_event_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admins read all bridge events"
  ON public.bridge_event_log FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'));

CREATE POLICY "Tenant members read their bridge events"
  ON public.bridge_event_log FOR SELECT TO authenticated
  USING (
    tenant_id IS NOT NULL
    AND tenant_id IN (
      SELECT p.tenant_id FROM public.profiles p WHERE p.id = auth.uid()
    )
  );

-- ---------- updated_at Trigger ----------
CREATE TRIGGER trg_bridge_workers_updated_at
  BEFORE UPDATE ON public.bridge_workers
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER trg_bridge_miniserver_links_updated_at
  BEFORE UPDATE ON public.bridge_miniserver_links
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ---------- Retention für bridge_event_log (7 Tage) ----------
CREATE OR REPLACE FUNCTION public.bridge_event_log_cleanup()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  DELETE FROM public.bridge_event_log
  WHERE occurred_at < now() - INTERVAL '7 days';
$$;

-- pg_cron: tägliche Bereinigung um 03:17 UTC
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule('bridge_event_log_cleanup_daily')
      WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'bridge_event_log_cleanup_daily');
    PERFORM cron.schedule(
      'bridge_event_log_cleanup_daily',
      '17 3 * * *',
      $cmd$ SELECT public.bridge_event_log_cleanup(); $cmd$
    );
  END IF;
END $$;

-- ---------- Seed: Bridge-Worker + 3 Miniserver (Stadt Steinfurt) ----------
DO $$
DECLARE
  v_worker_id UUID;
  v_tenant_id UUID;
BEGIN
  -- Bridge-Worker anlegen (idempotent)
  INSERT INTO public.bridge_workers (name, description, host, status, enabled)
  VALUES ('hetzner-bridge-test', 'Loxone WebSocket Bridge auf Hetzner Testumgebung', 'hetzner-test', 'offline', true)
  ON CONFLICT (name) DO UPDATE SET description = EXCLUDED.description
  RETURNING id INTO v_worker_id;

  -- Tenant Stadt Steinfurt suchen (Best-effort: nichts erzwingen, falls Name abweicht)
  SELECT id INTO v_tenant_id
  FROM public.tenants
  WHERE lower(name) LIKE '%steinfurt%'
  ORDER BY created_at ASC
  LIMIT 1;

  -- 3 Miniserver verknüpfen (idempotent über UNIQUE worker_id+serial)
  INSERT INTO public.bridge_miniserver_links
    (worker_id, tenant_id, miniserver_serial, miniserver_generation, connection_kind, enabled, notes)
  VALUES
    (v_worker_id, v_tenant_id, '504F94A2BAA2', 2, 'remote_connect', true, 'Stadt Steinfurt – Miniserver 1'),
    (v_worker_id, v_tenant_id, '504F94A22D9C', 2, 'remote_connect', true, 'Stadt Steinfurt – Miniserver 2'),
    (v_worker_id, v_tenant_id, '504F94D107EE', 2, 'remote_connect', true, 'Stadt Steinfurt – Miniserver 3')
  ON CONFLICT (worker_id, miniserver_serial) DO NOTHING;
END $$;
