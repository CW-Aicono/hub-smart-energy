ALTER TABLE public.meters
  ADD COLUMN IF NOT EXISTS is_pulse_meter boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS volume_per_pulse numeric NULL;

COMMENT ON COLUMN public.meters.is_pulse_meter IS 'Impulszähler (Reedkontakt): Momentanwert des Miniservers ist unbrauchbar, Durchfluss wird aus Zählerstandsdifferenz gebildet.';
COMMENT ON COLUMN public.meters.volume_per_pulse IS 'Volumen je Impuls in der Quelleinheit (z. B. 0.1 = 10 Impulse pro m³).';