-- Add execution_source column to automation_execution_log
ALTER TABLE public.automation_execution_log
  ADD COLUMN IF NOT EXISTS execution_source text NOT NULL DEFAULT 'cloud';

-- Add api_key_hash column to gateway_devices for per-device API key validation
ALTER TABLE public.gateway_devices
  ADD COLUMN IF NOT EXISTS api_key_hash text;