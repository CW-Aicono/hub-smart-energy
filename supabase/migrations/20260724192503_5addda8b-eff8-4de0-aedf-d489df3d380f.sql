-- =====================================================================
-- Seed: Live-Bridge-Worker "hetzner-bridge-live" + Miniserver-Links
-- =====================================================================
-- Grund: Der Live-Worker-Container auf Hetzner läuft mit
--   BRIDGE_WORKER_NAME=hetzner-bridge-live
-- Bislang war in bridge_workers nur "hetzner-bridge-test" geseedet
-- (Migration 20260619221142). Dadurch antwortete gateway-ingest im
-- Handler handleBridgeReadings mit HTTP 404 {"error":"unknown worker_name"}
-- und der Worker konnte keine Readings schreiben.
--
-- Diese Migration legt den Live-Worker idempotent an und spiegelt die
-- 3 Steinfurt-Miniserver (identisch zum Test-Worker) auf ihn, damit die
-- Readings korrekt einem Tenant zugeordnet werden.
-- =====================================================================

DO $$
DECLARE
  v_worker_id UUID;
  v_tenant_id UUID;
BEGIN
  -- Live-Bridge-Worker anlegen (idempotent).
  -- Spalten exakt gemäß Schema aus 20260619221142:
  --   name, description, host, status (enum bridge_worker_status), enabled.
  INSERT INTO public.bridge_workers (name, description, host, status, enabled)
  VALUES (
    'hetzner-bridge-live',
    'Loxone WebSocket Bridge Live (Hetzner, sendet an api-ems.aicono.org)',
    'hetzner-live',
    'offline',
    true
  )
  ON CONFLICT (name) DO UPDATE SET description = EXCLUDED.description
  RETURNING id INTO v_worker_id;

  -- Tenant Stadt Steinfurt suchen (Best-effort, wie in der Original-Seed).
  SELECT id INTO v_tenant_id
  FROM public.tenants
  WHERE lower(name) LIKE '%steinfurt%'
  ORDER BY created_at ASC
  LIMIT 1;

  -- Dieselben 3 Miniserver wie beim Test-Worker (idempotent über UNIQUE
  -- worker_id + miniserver_serial).
  INSERT INTO public.bridge_miniserver_links
    (worker_id, tenant_id, miniserver_serial, miniserver_generation, connection_kind, enabled, notes)
  VALUES
    (v_worker_id, v_tenant_id, '504F94A2BAA2', 2, 'remote_connect', true, 'Stadt Steinfurt – Miniserver 1 (live)'),
    (v_worker_id, v_tenant_id, '504F94A22D9C', 2, 'remote_connect', true, 'Stadt Steinfurt – Miniserver 2 (live)'),
    (v_worker_id, v_tenant_id, '504F94D107EE', 2, 'remote_connect', true, 'Stadt Steinfurt – Miniserver 3 (live)')
  ON CONFLICT (worker_id, miniserver_serial) DO NOTHING;
END $$;
