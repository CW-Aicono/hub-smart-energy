
CREATE TABLE public.worker_controls (
  worker_key text PRIMARY KEY,
  display_name text NOT NULL,
  description text,
  enabled boolean NOT NULL DEFAULT true,
  paused_at timestamptz,
  paused_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  note text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, UPDATE ON public.worker_controls TO authenticated;
GRANT ALL ON public.worker_controls TO service_role;

ALTER TABLE public.worker_controls ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admins can view worker controls"
  ON public.worker_controls FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'::app_role));

CREATE POLICY "Super admins can update worker controls"
  ON public.worker_controls FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'::app_role));

CREATE OR REPLACE FUNCTION public.worker_controls_touch()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at := now();
  IF NEW.enabled = false AND (OLD.enabled = true OR OLD.paused_at IS NULL) THEN
    NEW.paused_at := now();
    NEW.paused_by := auth.uid();
  ELSIF NEW.enabled = true AND OLD.enabled = false THEN
    NEW.paused_at := NULL;
    NEW.paused_by := NULL;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_worker_controls_touch
  BEFORE UPDATE ON public.worker_controls
  FOR EACH ROW EXECUTE FUNCTION public.worker_controls_touch();

INSERT INTO public.worker_controls (worker_key, display_name, description) VALUES
  ('loxone_ws_worker', 'Loxone WebSocket Worker (Hetzner)', 'Dauerhafte WebSocket-Verbindungen zu Loxone-Miniservern auf Hetzner. Hauptquelle für meter_power_readings-Inserts.'),
  ('loxone_periodic_sync', 'Loxone Periodic Sync', 'Edge Function loxone-periodic-sync (Cron-gesteuert).'),
  ('shelly_periodic_sync', 'Shelly Periodic Sync', 'Edge Function shelly-periodic-sync (Cron-gesteuert).'),
  ('gateway_periodic_sync', 'Gateway Periodic Sync', 'Edge Function gateway-periodic-sync (Cron-gesteuert).'),
  ('brighthub_periodic_sync', 'BrightHub Periodic Sync', 'Edge Function brighthub-periodic-sync (Cron-gesteuert).');
