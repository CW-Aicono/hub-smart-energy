
-- Add gas-specific columns to meters table
ALTER TABLE public.meters ADD COLUMN IF NOT EXISTS gas_type text DEFAULT NULL;
ALTER TABLE public.meters ADD COLUMN IF NOT EXISTS zustandszahl numeric DEFAULT NULL;
ALTER TABLE public.meters ADD COLUMN IF NOT EXISTS brennwert numeric DEFAULT NULL;

COMMENT ON COLUMN public.meters.gas_type IS 'H (high calorific) or L (low calorific) gas type';
COMMENT ON COLUMN public.meters.zustandszahl IS 'Compression/state factor for gas volume correction, typically < 1';
COMMENT ON COLUMN public.meters.brennwert IS 'Calorific value in kWh/m³, e.g. 11.5 for H-Gas, 8.9 for L-Gas';
