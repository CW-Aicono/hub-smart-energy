ALTER TABLE energy_prices
  ADD COLUMN is_dynamic boolean NOT NULL DEFAULT false,
  ADD COLUMN spot_markup_per_unit numeric NOT NULL DEFAULT 0;