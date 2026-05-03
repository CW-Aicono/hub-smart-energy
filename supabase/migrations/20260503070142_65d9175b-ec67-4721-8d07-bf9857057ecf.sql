ALTER TABLE public.locations
  ADD COLUMN IF NOT EXISTS federal_state text;

CREATE INDEX IF NOT EXISTS idx_locations_federal_state
  ON public.locations(tenant_id, federal_state)
  WHERE federal_state IS NOT NULL;

COMMENT ON COLUMN public.locations.federal_state IS
  'Bundesland-Kürzel (BW, BY, BE, BB, HB, HH, HE, MV, NI, NW, RP, SL, SN, ST, SH, TH). Optional, hauptsächlich für Hauptstandort und länderspezifische Energieberichte.';