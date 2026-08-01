ALTER TABLE public.meters
  ADD COLUMN IF NOT EXISTS power_state_uuid text,
  ADD COLUMN IF NOT EXISTS power_state_key text,
  ADD COLUMN IF NOT EXISTS power_state_set_at timestamptz,
  ADD COLUMN IF NOT EXISTS power_state_set_by uuid;

COMMENT ON COLUMN public.meters.power_state_uuid IS 'Explizite Loxone-State-UUID der Momentanleistung. Wenn gesetzt, ist dies die EINZIGE Quelle fuer meter_power_readings_5min. Verhindert, dass kumulative Zaehlerstaende als Leistung interpretiert werden.';
COMMENT ON COLUMN public.meters.power_state_key IS 'Loxone-State-Name (z. B. Pwr, actual) zur Anzeige der gewaehlten Zuordnung.';

CREATE INDEX IF NOT EXISTS idx_meters_power_state_uuid
  ON public.meters (power_state_uuid)
  WHERE power_state_uuid IS NOT NULL;