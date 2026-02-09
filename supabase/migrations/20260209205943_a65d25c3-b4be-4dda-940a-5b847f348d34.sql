
-- Add capture type and sensor linkage to meters
ALTER TABLE public.meters
  ADD COLUMN capture_type TEXT NOT NULL DEFAULT 'manual',
  ADD COLUMN location_integration_id UUID REFERENCES public.location_integrations(id) ON DELETE SET NULL,
  ADD COLUMN sensor_uuid TEXT;

-- Add index for quick lookup
CREATE INDEX idx_meters_capture_type ON public.meters(capture_type);
CREATE INDEX idx_meters_location_integration_id ON public.meters(location_integration_id);
