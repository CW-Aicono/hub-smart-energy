-- Ensure stale threshold default of 900s exists under both key variants
-- (legacy unprefixed for edge function, prefixed for tenant-readable RLS).
INSERT INTO public.system_settings (key, value)
VALUES
  ('loxone_ws_stale_threshold_seconds', '900'),
  ('public.loxone_ws_stale_threshold_seconds', '900')
ON CONFLICT (key) DO NOTHING;