
ALTER TABLE public.locations
  ADD COLUMN IF NOT EXISTS hot_water_energy_type text NULL,
  ADD COLUMN IF NOT EXISTS hot_water_kwh_year numeric NULL,
  ADD COLUMN IF NOT EXISTS hot_water_share_pct numeric NULL;

-- Backfill from legacy fields
UPDATE public.locations
SET hot_water_energy_type = 'gas',
    hot_water_kwh_year = COALESCE(hot_water_kwh_year, hot_water_gas_kwh_year),
    hot_water_share_pct = COALESCE(hot_water_share_pct, hot_water_gas_share_pct)
WHERE hot_water_via_gas IS TRUE
  AND hot_water_energy_type IS NULL;
