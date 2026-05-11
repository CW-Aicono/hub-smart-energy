-- Repair-Migration für Bootstrap-Drift auf Hetzner:
-- Stellt sicher, dass public.sales_recommended_devices die Spalten distribution_id + scope hat,
-- BEVOR die Folge-Migration 20260508145707 darauf eine RLS-Policy bauen will.
-- Zeitstempel intentional eine Sekunde vor 20260508145707, damit sie zuerst läuft.
-- Auf Lovable Cloud sind die Spalten bereits vorhanden — vollständiges No-Op dank IF NOT EXISTS.

ALTER TABLE public.sales_recommended_devices
  ALTER COLUMN measurement_point_id DROP NOT NULL;

ALTER TABLE public.sales_recommended_devices
  ADD COLUMN IF NOT EXISTS distribution_id uuid
    REFERENCES public.sales_distributions(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS scope text NOT NULL DEFAULT 'measurement_point';

UPDATE public.sales_recommended_devices
   SET scope = 'measurement_point'
 WHERE scope IS NULL OR scope = '';

CREATE INDEX IF NOT EXISTS idx_sales_recommended_devices_distribution
  ON public.sales_recommended_devices(distribution_id)
  WHERE distribution_id IS NOT NULL;

ALTER TABLE public.sales_recommended_devices
  DROP CONSTRAINT IF EXISTS sales_recommended_devices_scope_check;

ALTER TABLE public.sales_recommended_devices
  ADD CONSTRAINT sales_recommended_devices_scope_check
  CHECK (
    (scope = 'measurement_point' AND measurement_point_id IS NOT NULL)
    OR (scope = 'distribution' AND distribution_id IS NOT NULL)
    OR (scope = 'project')
  );
