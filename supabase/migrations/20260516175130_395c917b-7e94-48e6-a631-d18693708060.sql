ALTER TABLE public.meters
  ADD COLUMN IF NOT EXISTS meter_offset_kwh numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS meter_offset_set_at timestamptz,
  ADD COLUMN IF NOT EXISTS meter_offset_reason text,
  ADD COLUMN IF NOT EXISTS meter_offset_note text,
  ADD COLUMN IF NOT EXISTS replaces_meter_id uuid REFERENCES public.meters(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.meters.meter_offset_kwh IS 'Konstanter Offset (kWh), der zum gemessenen Verbrauchsstand addiert wird. Wird für Anfangsbestand bei Übernahme bestehender Zähler oder nach Gerätetausch genutzt. Beeinflusst NUR den angezeigten Zählerstand, NICHT Verbrauchsdifferenzen.';
COMMENT ON COLUMN public.meters.meter_offset_set_at IS 'Zeitpunkt, ab dem der Offset gilt.';
COMMENT ON COLUMN public.meters.meter_offset_reason IS 'Begründung: initial_reading | device_replacement | manual_correction';
COMMENT ON COLUMN public.meters.replaces_meter_id IS 'Verweis auf den ersetzten (alten) Zähler bei Gerätetausch (nur Audit).';