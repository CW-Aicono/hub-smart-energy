ALTER TABLE public.device_catalog
  ADD COLUMN IF NOT EXISTS artikelnummer text,
  ADD COLUMN IF NOT EXISTS ean text;

CREATE INDEX IF NOT EXISTS idx_device_catalog_artikelnummer ON public.device_catalog (artikelnummer);
CREATE INDEX IF NOT EXISTS idx_device_catalog_ean ON public.device_catalog (ean);