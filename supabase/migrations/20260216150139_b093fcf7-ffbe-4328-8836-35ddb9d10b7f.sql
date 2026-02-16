
-- Add sync tracking columns to brighthub_settings
ALTER TABLE public.brighthub_settings 
  ADD COLUMN IF NOT EXISTS last_meter_sync_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_reading_sync_at timestamptz;
