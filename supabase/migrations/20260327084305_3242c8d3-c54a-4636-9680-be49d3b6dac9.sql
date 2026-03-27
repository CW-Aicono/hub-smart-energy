
-- Add name column to pv_forecast_settings for multi-array support
ALTER TABLE public.pv_forecast_settings
  ADD COLUMN IF NOT EXISTS name text NOT NULL DEFAULT 'Anlage 1';

-- Drop the unique constraint on (tenant_id, location_id) to allow multiple arrays per location
ALTER TABLE public.pv_forecast_settings
  DROP CONSTRAINT IF EXISTS pv_forecast_settings_tenant_id_location_id_key;
