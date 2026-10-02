ALTER TABLE public.locations
  ADD COLUMN IF NOT EXISTS hot_water_via_gas boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS hot_water_gas_share_pct numeric,
  ADD COLUMN IF NOT EXISTS hot_water_gas_kwh_year numeric;

ALTER TABLE public.locations
  DROP CONSTRAINT IF EXISTS locations_hot_water_share_pct_range;
ALTER TABLE public.locations
  ADD CONSTRAINT locations_hot_water_share_pct_range
  CHECK (hot_water_gas_share_pct IS NULL OR (hot_water_gas_share_pct >= 0 AND hot_water_gas_share_pct <= 100));

ALTER TABLE public.locations
  DROP CONSTRAINT IF EXISTS locations_hot_water_kwh_year_nonneg;
ALTER TABLE public.locations
  ADD CONSTRAINT locations_hot_water_kwh_year_nonneg
  CHECK (hot_water_gas_kwh_year IS NULL OR hot_water_gas_kwh_year >= 0);