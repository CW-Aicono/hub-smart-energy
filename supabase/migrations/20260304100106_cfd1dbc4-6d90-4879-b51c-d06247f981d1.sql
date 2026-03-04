ALTER TABLE public.integration_errors
  ADD COLUMN IF NOT EXISTS sensor_name text,
  ADD COLUMN IF NOT EXISTS sensor_type text;