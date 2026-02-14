-- Add source_unit column to meters table
-- This stores the unit that the gateway API delivers (e.g. W vs kW, Wh vs kWh)
-- so we can correctly scale values for display
ALTER TABLE public.meters
ADD COLUMN source_unit_power text DEFAULT 'kW',
ADD COLUMN source_unit_energy text DEFAULT 'kWh';

COMMENT ON COLUMN public.meters.source_unit_power IS 'Unit the gateway delivers for power values: W or kW';
COMMENT ON COLUMN public.meters.source_unit_energy IS 'Unit the gateway delivers for energy values: Wh or kWh';