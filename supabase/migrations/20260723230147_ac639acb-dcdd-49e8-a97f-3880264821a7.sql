
-- Public-readable subset of system_settings for shared UI thresholds.
CREATE POLICY "Authenticated can read public.* system settings"
ON public.system_settings
FOR SELECT
TO authenticated
USING (key LIKE 'public.%');

INSERT INTO public.system_settings (key, value, description)
VALUES ('public.loxone_ws_stale_threshold_seconds', '180',
        'Sekunden ohne Session-Heartbeat, ab denen die Loxone-WS-Verbindung im UI als "stale" markiert wird.')
ON CONFLICT (key) DO NOTHING;
