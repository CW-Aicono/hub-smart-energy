ALTER TABLE public.energy_prices
ADD COLUMN meter_id uuid REFERENCES public.meters(id) ON DELETE SET NULL DEFAULT NULL;

COMMENT ON COLUMN public.energy_prices.meter_id IS 'Optional: assigns price to a specific main meter. Sub-meters inherit from their parent main meter. NULL = location-wide fallback.';